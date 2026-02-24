<?php

use Carbon\Carbon;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2015, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link           http://pancakeapp.com
 * @since          Version 3.1
 */
// ------------------------------------------------------------------------

/**
 * The Pancake Update System
 *
 * @subpackage    Models
 * @category      Upgrade
 */
class Update_system_m extends Pancake_Model {

    public $write = false;
    public $ftp = false;
    public $ftp_conn = false;
    public $version_hashes = null;
    public $error;

    /**
     * The construct.
     * Verifies if Pancake can write to itself or FTP to itself.
     */
    function __construct() {
        parent::__construct();

        include_once APPPATH . 'libraries/HTTP_Request.php';

        $this->get_latest_version();
        $this->can_write_update();
        $this->get_installation_id();
    }

    function get_installation_id() {
        if (!Settings::get("installation_id")) {
            Settings::set("installation_id", uniqid(rand(), true));
        }

        return Settings::get("installation_id");
    }

    function get_error() {
        return __('update:' . $this->error);
    }

    /**
     * Checks if a given FTP configuration works with Pancake.
     *
     * @param string  $host
     * @param string  $user
     * @param string  $pass
     * @param integer $port
     * @param string  $path
     * @param boolean $passive
     *
     * @return boolean
     */
    function test_ftp($host, $user, $pass, $port, $path, $passive) {
        $passive = (bool) $passive;
        $port = (int) $port;
        $path = (substr($path, strlen($path) - 1, 1) == '/') ? $path : $path . '/';

        $connection = @ftp_connect($host, $port);

        if (!$connection) {
            $this->error = 'ftp_conn';
            return false;
        } else {

            if (!@ftp_login($connection, $user, $pass)) {
                $this->error = 'ftp_login';
                return false;
            }

            @ftp_pasv($connection, $passive);

            if (!@ftp_chdir($connection, $path)) {
                $this->error = 'ftp_chdir';
                return false;
            }
        }

        $tmpNam = tempnam(sys_get_temp_dir(), 'test');

        if (@ftp_get($connection, $tmpNam, 'index.php', FTP_ASCII)) {
            if (stristr(file_get_contents($tmpNam), "require_once 'system/pancake/pancake_index.php'") !== false) {
                $uploaded = @ftp_put($connection, 'uploads/test.txt', $tmpNam, FTP_BINARY);
                if ($uploaded) {
                    @ftp_delete($connection, 'uploads/test.txt');
                    return true;
                } else {
                    $this->error = 'ftp_no_uploads';
                    return false;
                }
            } else {
                $this->error = 'ftp_indexwrong';
                return false;
            }
        } else {
            # Couldn't get the file. I assume it's because the file didn't exist.
            $this->error = 'ftp_indexnotfound';
            return false;
        }

        return true;
    }

    function count_available_updates() {
        try {
            $key = array_search(Settings::get('version'), array_keys($this->get_changelog()));
            if ($key === false) {
                # It's missing all the versions.
                return count($this->get_changelog());
            } else {
                # It's missing $key versions. The array is like:
                # array('4.8.36', '4.8.35', '4.8.34', '4.8.33', '4.8.32', '4.8.31', '4.8.30')
                # So if you're on 4.8.35, the $key is 1, and you're missing 1 update (4.8.36).
                return $key;
            }
        } catch (\Pancake\Update\DownloadException $e) {
            return 0;
        }
    }

    function verify_integrity($files_to_verify = null) {
        $hashes = $this->get_hashes();
        $failed_hashes = array();
        $deleted_files = 0;
        $modified_files = 0;

        $ignored_files = array(
            "example.htaccess",
            "LICENSE",
        );

        $ignored_masks = array(
            "mustRead.html",
            "index.html",
            ".htaccess",
            ".project",
            ".gitignore",
            ".gitmodules",
        );

        # Fixes an issue where files no longer exist but the server still reports them as existing.
        clearstatcache();

        foreach ($hashes as $file => $hash) {
            foreach ($ignored_files as $ignored_file) {
                if ($file == $ignored_file) {
                    continue 2;
                }
            }

            foreach ($ignored_masks as $ignored_mask) {
                if ($file == $ignored_mask || substr($file, -strlen("/$ignored_mask")) == "/$ignored_mask") {
                    continue 2;
                }
            }

            if (is_array($files_to_verify) && !in_array($file, $files_to_verify)) {
                continue;
            }

            if (substr($file, -strlen("/index.html")) == "/index.html" || $file == ".htaccess" || $file == "example.htaccess") {
                # Ignore index.html files.
                continue;
            }

            if (file_exists(FCPATH . $file)) {
                $new_hash = md5_file(FCPATH . $file);
                if ($new_hash != $hash) {
                    $failed_hashes[$file] = "M";
                    $modified_files++;
                }
            } else {
                $failed_hashes[$file] = "D";
                $deleted_files++;
            }
        }

        $this->db->reconnect();

        return array(
            "success" => count($failed_hashes) == 0,
            "modified_files" => $modified_files,
            "deleted_files" => $deleted_files,
            "failed_hashes" => $failed_hashes,
        );
    }

    /**
     * Tries to write to a file/directory.
     *
     * @param string $file
     *
     * @return bool
     */
    function is_really_writable($file) {

        if (!file_exists($file)) {
            # The file is about to be created; we actually want to test the writability of its parent folder.
            return $this->is_really_writable(dirname($file));
        }

        // If we're on a Unix server with safe_mode off we call is_writable
        if (DIRECTORY_SEPARATOR == '/' AND @ini_get("safe_mode") == false) {
            return is_writable($file);
        }

        // For windows servers and safe_mode "on" installations we'll actually
        // write a file then read it.  Bah...
        if (is_dir($file)) {
            $file = rtrim($file, '/') . '/' . md5(mt_rand(1, 100) . mt_rand(1, 100));

            if (($fp = @fopen($file, FOPEN_WRITE_CREATE)) === false) {
                return false;
            }

            fclose($fp);
            @chmod($file, DIR_WRITE_MODE);
            @unlink($file);

            return true;
        } elseif (!is_file($file) OR ($fp = @fopen($file, FOPEN_WRITE_CREATE)) === false) {
            return false;
        }

        fclose($fp);

        return true;
    }

    /**
     * Checks every changed file to see if it's really writable.
     *
     * @return boolean
     */
    function can_write_update() {
        if (!$this->is_really_writable(APPPATH . "maintenance.php")) {
            $this->write = false;
        } else {
            if (Settings::get("latest_version") != Settings::get("version")) {
                $changed_files = json_decode(Settings::get('changed_files'), true);
                if (!is_array($changed_files)) {
                    $changed_files = array();
                }

                $this->write = true;

                foreach ($changed_files as $file) {
                    $file = explode("]", $file, 2);
                    $file = trim($file[1]);

                    if (!$this->is_really_writable(FCPATH . $file)) {
                        $this->write = false;
                    }
                }
            } else {
                if (function_exists('getmyuid') && function_exists('fileowner')) {
                    $test_file = FCPATH . 'uploads/test-' . time();
                    $test = @fopen($test_file, 'w');
                    if ($test) {
                        if (function_exists('posix_getuid')) {
                            $posix = posix_getuid() == @fileowner($test_file);
                        } else {
                            $posix = false;
                        }
                        $this->write = ((getmyuid() == @fileowner($test_file)) || $posix);
                        @fclose($test);
                        @unlink($test_file);
                    } else {
                        $this->write = false;
                    }
                } else {
                    $this->write = false;
                }
            }
        }

        if (!$this->write) {
            $user = Settings::get('ftp_user');
            $this->ftp = !empty($user);
        }

        return $this->write || $this->ftp;
    }

    /**
     * Updates Pancake to the latest version.
     * If Pancake cannot write to itself via PHP, it will try to do so via FTP.
     * If it can't do it with either, it will return false.
     *
     * @return boolean
     */
    function update_pancake($retry = true) {
        if (function_exists("set_time_limit") && @ini_get("safe_mode") == 0) {
            @set_time_limit(0);
        }

        $original_current_version = Settings::get("version");

        # Force a recheck for updates.
        $this->get_latest_version(true);

        if (Settings::get("latest_version") == Settings::get("version")) {
            return true;
        }

        if (!$this->can_write_update()) {
            $this->error = 'update_no_perms';
            return false;
        }

        $this->set_file_contents(APPPATH . "maintenance.php", '<?php $under_maintenance = true;');

        # Download and apply the update.
        $http = new HTTP_Request();
        $url = MANAGE_PANCAKE_BASE_URL . "update.json";
        try {
            $data = array(
                "license_key" => Settings::get("license_key"),
                "current_version" => Settings::get("version"),
                "url" => BASE_URL,
                "installation_id" => $this->get_installation_id(),
                "php" => phpversion(),
                "has_mbstring" => extension_loaded("mbstring"),
                "has_iconv" => extension_loaded("iconv"),
            );

            for ($i = 1; $i <= Settings::get("suzip_parts"); $i++) {
                $data['part'] = $i;
                $original_contents = $http->request($url, 'POST', $data);
                $this->db->reconnect();
                $package = json_decode($original_contents, true);
                if (!isset($GLOBALS['HTTP_REQUESTS'])) {
                    $GLOBALS['HTTP_REQUESTS'] = 0;
                }
                $GLOBALS['HTTP_REQUESTS']++;

                if (md5($package["suzip"]) != $package["suzip_integrity_hash"]) {
                    if ($retry) {
                        $this->update_pancake(false);
                    } else {
                        throw new \Pancake\Update\DownloadException(\Pancake\Update\DownloadException::MESSAGE_UPDATE);
                    }
                }

                $package["suzip"] = base64_decode($package["suzip"]);

                if ($package["suzip"] === false) {
                    throw new \Pancake\Update\DownloadException(\Pancake\Update\DownloadException::MESSAGE_UPDATE);
                }

                $package["suzip"] = unserialize($package["suzip"]);

                if ($package["suzip"] === false || !is_array($package["suzip"])) {
                    throw new \Pancake\Update\DownloadException(\Pancake\Update\DownloadException::MESSAGE_UPDATE);
                }

                foreach ($package["suzip"] as $file => $contents) {
                    $file = substr($file, strlen("pancake/")); # Remove the pancake/ prefix.
                    $this->set_file_contents(FCPATH . $file, $contents);
                }
            }
        } catch (HTTP_Request_Exception $e) {
            # Take Pancake off maintenance mode because there was an error.
            $this->set_file_contents(APPPATH . "maintenance.php", '<?php $under_maintenance = false;');
            deal_with_no_internet(true, $url);
        }

        # Delete old files.
        $changed_files = json_decode(Settings::get('changed_files'), true);
        foreach ($changed_files as $file) {
            $file = trim($file);
            if (!empty($file)) {
                if (substr($file, 0, 5) == '[Dele') {
                    # Deleted.
                    $file = substr($file, strlen("[Deleted] "));
                    $this->delete(FCPATH . $file);
                }
            }
        }

        # Refresh version.
        get_instance()->settings->reload();

        # Force a recheck for updates.
        $this->get_latest_version(true);

        clearstatcache();

        $failed_changes = array();
        $files_to_verify = array();

        foreach ($changed_files as $file) {
            $file = trim($file);
            if (!empty($file)) {
                if (substr($file, 0, strlen("[Del")) == "[Del") {
                    $file = substr($file, strlen("[Deleted] "));
                    if (file_exists(FCPATH . $file)) {
                        $failed_changes[$file] = "D";
                    }
                } elseif (substr($file, 0, strlen("[Mod")) == "[Mod") {
                    $file = substr($file, strlen("[Modified] "));
                    $files_to_verify[] = $file;
                } elseif (substr($file, 0, strlen("[Add")) == "[Add") {
                    $file = substr($file, strlen("[Added] "));
                    $files_to_verify[] = $file;
                }
            }
        }

        $result = $this->verify_integrity($files_to_verify);
        $failed_changes = array_merge($failed_changes, $result['failed_hashes']);

        # Take Pancake off maintenance mode because the update process is complete.
        $this->set_file_contents(APPPATH . "maintenance.php", '<?php $under_maintenance = false;');

        if (count($failed_changes) > 0) {
            # Force Pancake back to show that it's still on the old version so that the update can be reattempted later.
            $this->set_file_contents(APPPATH . "VERSION", $original_current_version);

            throw new \Pancake\Update\UpdateException($original_current_version, Settings::get("latest_version"), $failed_changes);
        }
    }

    function get_changelog($processed = false) {
        $is_outdated = Settings::get("version") != Settings::get("latest_version");
        $changelog = Settings::get("changelog");
        $changelog = $changelog ? json_decode($changelog, true) : $changelog;

        if (!is_array($changelog) || ($is_outdated && count($changelog) == 0)) {
            # Force a recheck for updates.
            $this->get_latest_version(true);
        }

        $is_outdated = Settings::get("version") != Settings::get("latest_version");
        $changelog = Settings::get("changelog");
        $changelog = $changelog ? json_decode($changelog, true) : $changelog;

        if (!is_array($changelog) || ($is_outdated && count($changelog) == 0)) {
            throw new \Pancake\Update\DownloadException(\Pancake\Update\DownloadException::MESSAGE_CHANGELOG);
        }

        $changelog = json_decode(Settings::get("changelog"), true);

        if ($processed) {
            $converter = new Parsedown();
            foreach ($changelog as $version => $contents) {
                $contents = "### $version\n\n" . $contents;
                $changelog[$version] = $converter->parse($contents);
            }
            $changelog = implode("", $changelog);
            return $changelog;
        } else {
            return $changelog;
        }
    }

    function get_hashes($retry_if_fail = true) {
        $hashes = Settings::get('hashes');

        if (!$hashes || Settings::get('hashes_version') !== Settings::get('version')) {
            # Force a recheck for updates.
            $this->get_latest_version(true);
        }

        $hashes = Settings::get('hashes');

        if (!$hashes) {
            throw new \Pancake\Update\DownloadException(\Pancake\Update\DownloadException::MESSAGE_HASHES);
        }

        # Make sure the settings table has the correct types for its fields.
        $buffer = $this->db->query("show columns from " . $this->db->dbprefix("settings"))->result_array();
        $type = "n/a";
        if (isset($buffer[1]) && $buffer[1]['Field'] == "value") {
            $type = $buffer[1]["Type"];
            if ($buffer[1]["Type"] != "longtext") {
                $this->db->query("alter table " . $this->db->dbprefix("settings") . " change `value` `value` longtext  character set utf8  null");
                # Force a recheck for updates.
                $this->get_latest_version(true);
                $hashes = Settings::get('hashes');
            }
        }

        $current_version_hashes = explode("\n", $hashes);
        $hashes = array();

        foreach ($current_version_hashes as $hash) {
            $hash = trim($hash);
            if (!empty($hash)) {
                $original_hash = $hash;
                $hash = explode(' :.: ', $hash);
                if (!isset($hash[1])) {
                    if ($retry_if_fail) {
                        # Force a recheck for updates.
                        $this->get_latest_version(true);
                        return $this->get_hashes(false);
                    } else {
                        throw new \Pancake\Update\DownloadException(\Pancake\Update\DownloadException::MESSAGE_HASHES);
                    }
                }
                $file = $hash[0];
                $hash = $hash[1];

                $hashes[$file] = $hash;
            }
        }
        return $hashes;
    }

    function check_for_conflicts() {
        $integrity = $this->verify_integrity();
        $failed_hashes = $integrity['failed_hashes'];
        $changed_files = json_decode(Settings::get('changed_files'), true);
        $conflicted = array();

        foreach ($changed_files as $file) {
            $file = explode("]", $file, 2);
            $file = trim($file[1]);
            if (isset($failed_hashes[$file])) {
                $conflicted[$file] = $failed_hashes[$file];
            }
        }

        return $conflicted;
    }

    /**
     * Fetches the latest version IFF more than 1 hour has passed since the last fetch.
     * Downloads the latest version and caches it if it finds it.
     * The latest version downloader will create a notification for the new update.
     */
    function get_latest_version(bool $force = false): string
    {
        if (!Settings::get('latest_version') || !Settings::get('latest_version_fetch') || !Settings::get('changelog')) {
            $force = true;
        }

        $current = Settings::get('version');
        $latest = $current;

        $last_fetch = Carbon::createFromTimestamp(Settings::get('latest_version_fetch'));
        $next_fetch = $last_fetch->copy()->addWeek();
        if ($next_fetch->isPast() or $force) {
            $guzzle = new Client([
                "base_uri" => MANAGE_PANCAKE_BASE_URL,
                "connect_timeout" => 2,
                "timeout" => 5,
                "headers" => [
                    "User-Agent" => "Pancake " . Settings::get("version"),
                ],
            ]);

            if (!isset($GLOBALS['HTTP_REQUESTS'])) {
                $GLOBALS['HTTP_REQUESTS'] = 0;
            }

            try {
                $GLOBALS['HTTP_REQUESTS']++;
                $url = "version.json";
                $data = [
                    "license_key" => Settings::get("license_key"),
                    "current_version" => $current,
                    "url" => BASE_URL,
                    "installation_id" => $this->get_installation_id(),
                    "php" => phpversion(),
                ];

                $response = $guzzle->post($url, [
                    "form_params" => $data,
                ]);

                $buffer = json_decode($response->getBody()->getContents(), true);

                $this->db->reconnect();

                if ($buffer) {
                    Settings::set('latest_version', $buffer['version']);
                    Settings::set('changelog', json_encode($buffer['changelog']));
                    Settings::set('hashes', $buffer['hashes']);
                    Settings::set('hashes_version', $current);
                    Settings::set('suzip_parts', $buffer['suzip_parts']);
                    Settings::set('changed_files', json_encode($buffer['changed_files']));
                    Settings::set('latest_version_fetch', time());
                }

                // Now check for plugin updates:
                $CI = get_instance();
                $CI->load->model('store/store_m');
                $CI->store_m->check_for_updates();

                $this->db->reconnect();
            } catch (GuzzleException $e) {
                # The update server is having issues, or this Pancake doesn't allow external connections.
                # We'll try again in a week.
                Settings::set('latest_version_fetch', time());
            }
        }

        return $latest;
    }

    /**
     * Creates a file with $data if it doesn't exist, or updates it with $data if it exists.
     * If Pancake cannot write to itself via PHP, it will try to do so via FTP.
     * If it can't do it with either, it will return false.
     * $filename is ABSOLUTE, and starts with FCPATH.
     *
     * @param string $filename
     * @param string $data
     *
     * @return boolean
     */
    function set_file_contents($filename, $data) {
        if ($this->write) {

            $dir = dirname($filename);
            $dir = str_ireplace(rtrim(FCPATH, '/\\'), '', $dir);
            $dir = explode("/", $dir);
            $path = "";

            for ($i = 0; $i < count($dir); $i++) {
                $path .= $dir[$i] . '/';

                if ($path != '/' and !file_exists(FCPATH . $path)) {
                    if (!@mkdir(FCPATH . $path)) {
                        return false;
                    } else {
                        # CHMOD recently-created update folder just in case.
                        if (stristr($path, 'pancake-update-system') !== false) {
                            @chmod(FCPATH . $path, 0777);
                        }
                    }
                }
            }

            file_put_contents($filename, $data);
            @chmod($filename, 0755);
        } elseif ($this->ftp) {
            $filename = str_ireplace(FCPATH, '', $filename);
            $connection = $this->get_ftp_connection();

            # Create the folder where the file is in, if it does not exist. Recursive.
            $dir = explode("/", dirname($filename));
            $path = "";

            for ($i = 0; $i < count($dir); $i++) {
                $path .= $dir[$i] . '/';

                $origin = @ftp_pwd($connection);

                if (!@ftp_chdir($connection, $path)) {
                    if (!@ftp_mkdir($connection, $path)) {
                        return false;
                    } else {
                        # CHMOD recently-created update folder just in case.
                        if (stristr($path, 'pancake-update-system') !== false) {
                            @ftp_chmod($connection, 0777, $path);
                        }
                    }
                }

                @ftp_chdir($connection, $origin);
            }
            $tmpNam = tempnam(sys_get_temp_dir(), 'test');
            file_put_contents($tmpNam, $data);
            @chmod($filename, 0755);
            @ftp_put($connection, $filename, $tmpNam, FTP_BINARY);
        }

        return (@file_get_contents($filename) == $data);
    }

    function delete($filename) {
        if (file_exists($filename)) {
            if ($this->write) {
                @unlink($filename);
            } elseif ($this->ftp) {
                $filename = str_ireplace(FCPATH, '', $filename);
                @ftp_delete($this->get_ftp_connection(), $filename);
            }
        }

        # Return true only if the file no longer exists.
        clearstatcache();
        return !file_exists($filename);
    }

    /**
     * Starts an FTP connection if necessary.
     * If an FTP connection was already established, it returns it.
     * Called whenever setting file contents or deleting files.
     */
    function get_ftp_connection() {

        if (!function_exists("ftp_connect")) {
            return false;
        }

        $host = Settings::get('ftp_host');
        $path = Settings::get('ftp_path');
        $user = Settings::get('ftp_user');
        $pass = Settings::get('ftp_pass');
        $port = Settings::get('ftp_port');
        $passive = Settings::get('ftp_pasv');

        if (!($this->ftp_conn)) {

            $port = (int) $port;
            $path = (substr($path, strlen($path) - 1, 1) == '/') ? $path : $path . '/';

            $connection = @ftp_connect($host, $port);

            if (!$connection) {
                return false;
            } else {

                if (!@ftp_login($connection, $user, $pass)) {
                    return false;
                }

                @ftp_pasv($connection, $passive);

                if (!@ftp_chdir($connection, $path)) {
                    return false;
                }
            }

            $this->ftp_conn = $connection;

            return $this->ftp_conn;
        } else {
            return $this->ftp_conn;
        }
    }

}
