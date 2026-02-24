<?php

/**
 * Pancake
 * A simple, fast, self-hosted invoicing application.
 *
 * @category  APIs
 * @package   Pancake
 * @author    Pancake Dev Team <support@pancakeapp.com>
 * @copyright 2016 Pancake Payments
 * @license   https://www.pancakeapp.com/license Pancake End User License Agreement
 * @link      https://www.pancakeapp.com
 * @since     4.12.0
 */

namespace Pancake\Filesystem;

use Aws\S3\S3Client;
use League\Flysystem\Adapter\Local;
use League\Flysystem\Adapter\Ftp;
use League\Flysystem\AdapterInterface;
use League\Flysystem\MountManager;
use League\Flysystem\AwsS3v3\AwsS3Adapter;

/**
 * The Filesystem API<br />Allows you to upload and read files from Pancake.
 *
 * @category Filesystem
 */
class Filesystem {

    const UPLOAD_ERROR_EXTENSION = 'extension';

    /**
     * The shared instance of Flysystem.
     *
     * @var MountManager
     */
    protected static $flysystem;

    protected static $settings;

    protected static function loadSettings() {
        if (static::$settings === null) {
            $default_settings = [
                "adapters" => ["local"],
                "local" => "uploads",
            ];

            $settings = \Settings::get("filesystem");
            if (empty($settings)) {
                $settings = $default_settings;
            } else {
                if (is_encrypted($settings)) {
                    try {
                        $settings = decrypt($settings);
                        $settings = json_decode($settings, true);
                    } catch (\DomainException $e) {
                        # Reset the settings.
                        $settings = $default_settings;
                    }
                } else {
                    $settings = json_decode($settings, true);
                }

                if (!isset($settings["adapters"])) {
                    $settings["adapters"] = ["local"];
                }

                if (in_array("local", $settings["adapters"])) {
                    $settings["local"] = "uploads";
                }

                foreach (array_keys(static::getAdapters()) as $adapter) {
                    if (!in_array($adapter, $settings["adapters"])) {
                        unset($settings[$adapter]);
                    }
                }
            }

            static::$settings = $settings;
        }
    }

    protected static function getMountManager($settings) {
        $mount = [];
        foreach ($settings["adapters"] as $enabled_adapter) {
            switch ($enabled_adapter) {
                case "ftp":
                    $adapter = new Ftp([
                        'host' => 'ftp.example.com',
                        'username' => 'username',
                        'password' => 'password',

                        /** optional config settings */
                        'port' => 21,
                        'root' => '/path/to/root',
                        'passive' => true,
                        'ssl' => true,
                        'timeout' => 10,
                    ]);

                    $mount["ftp"] = $adapter;
                    break;
                case "s3":
                    $data = array(
                        'credentials' => [
                            'key' => $settings["s3"]["access_key"],
                            'secret' => $settings["s3"]["secret_key"],
                        ],
                        'region' => $settings["s3"]["region"],
                        'version' => '2006-03-01',
                    );

                    $s3 = new S3Client($data);
                    $adapter = new AwsS3Adapter($s3, $settings["s3"]["bucket"], $settings["s3"]["prefix"]);
                    $mount["s3"] = new \League\Flysystem\Filesystem($adapter);
                    break;
                default:
                    $adapter = new Local(FCPATH . "uploads");
                    $mount["local"] = new \League\Flysystem\Filesystem($adapter);
                    break;
            }
        }

        return new MountManager($mount);
    }

    protected static function loadAdapters() {
        static::loadSettings();

        if (static::$flysystem === null) {
            static::$flysystem = static::getMountManager(static::$settings);
        }
    }

    public static function getAdapters() {
        return [
            "local" => __("settings:filesystem_local"),
            #"dropbox" => "Dropbox",
            "s3" => "S3",
            #"ftp" => "FTP",
            #"sftp" => "SFTP",
        ];
    }

    public static function getEnabledAdapters() {
        static::loadSettings();
        return array_values(static::$settings["adapters"]);
    }

    public static function getSetting($adapter, $setting) {
        if (isset(static::$settings[$adapter])) {
            if (isset(static::$settings[$adapter][$setting])) {
                return static::$settings[$adapter][$setting];
            } else {
                return null;
            }
        } else {
            return null;
        }
    }

    public static function storeAdapterSettings($new_settings) {
        static::loadSettings();

        # If no adapters were selected, enforce local.
        if (!isset($new_settings["adapters"])) {
            $new_settings = [
                "adapters" => ["local"],
                "local" => "uploads",
            ];
        }

        if (in_array("local", $new_settings["adapters"]) && !isset($new_settings["local"])) {
            $new_settings["local"] = "uploads";
        }

        $adapters_added = [];
        $adapters_removed = [];
        foreach (array_keys(static::getAdapters()) as $adapter) {
            if (!in_array($adapter, $new_settings["adapters"])) {
                unset($new_settings[$adapter]);
            }

            $previous_settings = isset(self::$settings[$adapter]) ? self::$settings[$adapter] : [];
            if ($adapter == "s3") {
                unset($previous_settings["region"]);
            }

            if (isset(self::$settings[$adapter]) && !isset($new_settings[$adapter])) {
                # Adapter was enabled, and has been disabled.
                $adapters_removed[] = $adapter;
            } elseif (!isset(self::$settings[$adapter]) && !isset($new_settings[$adapter])) {
                # Adapter was disabled, and stayed disabled.
            } elseif (!isset(self::$settings[$adapter]) && isset($new_settings[$adapter])) {
                # Adapter was disabled, and has been enabled.
                $adapters_added[] = $adapter;
            } elseif ($previous_settings != $new_settings[$adapter]) {
                # Adapter was enabled, but changed.
                $adapters_added[] = $adapter;
                $adapters_removed[] = $adapter;
            }
        }


        # Find the location for the bucket.
        if (in_array("s3", $new_settings["adapters"])) {
            if (in_array("s3", $adapters_added)) {
                $data = array(
                    'credentials' => [
                        'key' => $new_settings["s3"]["access_key"],
                        'secret' => $new_settings["s3"]["secret_key"],
                    ],
                    'region' => 'eu-west-1',
                    'version' => '2006-03-01',
                );

                $s3 = new S3Client($data);
                $new_settings["s3"]["region"] = $s3->getBucketLocation(['Bucket' => $new_settings["s3"]["bucket"]])->get("LocationConstraint");
            } else {
                $new_settings["s3"]["region"] = self::$settings["s3"]["region"];
            }
        }

        $files_to_migrate = [];
        if (!empty($adapters_added) || !empty($adapters_removed)) {
            $files_to_migrate = array_keys(static::listContents());
        }

        if (!empty($adapters_added)) {
            $new_mount_manager = static::getMountManager($new_settings);

            foreach ($adapters_added as $adapter) {
                foreach ($files_to_migrate as $filename) {
                    $contents = static::read($filename);
                    if (!$new_mount_manager->has("$adapter://$filename")) {
                        if (!$new_mount_manager->write("$adapter://$filename", $contents, ['visibility' => AdapterInterface::VISIBILITY_PRIVATE])) {
                            $adapter_labels = static::getAdapters();
                            throw new WriteException("Could not store $filename in {$adapter_labels[$adapter]}.");
                        }
                    }
                }
            }
        }

        /*
         * Code to delete files from removed adapters.
         * We're not doing that right now, it's too destructive.
         * It's here for reference, though.
         *
        if (!empty($adapters_removed)) {
            foreach ($adapters_removed as $adapter) {
                foreach ($files_to_migrate as $filename) {
                    if (static::$flysystem->has("$adapter://$filename")) {
                        if (!static::$flysystem->delete("$adapter://$filename")) {
                            $adapter_labels = static::getAdapters();
                            throw new DeleteException("Could not delete $filename in {$adapter_labels[$adapter]}.");
                        }
                    }
                }
            }
        }
        */

        # Store the new settings in the DB.
        \Settings::set("filesystem", json_encode($new_settings, JSON_PRETTY_PRINT), "filesystem");

        # Reload the settings.
        static::$settings = null;
        static::loadSettings();
    }

    public static function read($filename) {
        static::loadAdapters();
        # Find an adapter that has the file.
        foreach (static::getEnabledAdapters() as $adapter) {
            if (static::$flysystem->has("$adapter://$filename")) {
                return static::$flysystem->read("$adapter://$filename");
            }
        }

        throw new FileNotFoundException("Could not find $filename in any available adapter.");
    }

    public static function url($filename)
    {
        $url_encoded = urlencode($filename);
        $url_encoded = str_replace("%2F", "/", $url_encoded);
        return site_url("files/fetch/$url_encoded/fetch");
    }

    public static function generateFilename($original_filename, $path = '') {
        $extension = "." . pathinfo($original_filename, PATHINFO_EXTENSION);
        $path = rtrim($path, "/") . "/";
        $filename = random_string('alnum', 8) . $extension;
        while (static::has($path . $filename)) {
            $filename = random_string('alnum', 8) . $extension;
        }
        return $filename;
    }

    public static function write($filename, $contents, $config = ['visibility' => AdapterInterface::VISIBILITY_PRIVATE]) {
        static::loadAdapters();
        $written_files = [];

        foreach (static::getEnabledAdapters() as $adapter) {
            if (static::$flysystem->write("$adapter://$filename", $contents, $config)) {
                $written_files[] = $filename;
            } else {
                # Could not replicate the file to an adapter, so delete all existing copies and fail.
                foreach ($written_files as $file) {
                    static::$flysystem->delete($file);
                }

                $adapter_labels = static::getAdapters();
                throw new WriteException("Could not store $filename in {$adapter_labels[$adapter]}.");
            }
        }

        return true;
    }

    public static function writeStream($filename, $resource, $config = ['visibility' => AdapterInterface::VISIBILITY_PRIVATE]) {
        static::loadAdapters();
        $written_files = [];

        foreach (static::getEnabledAdapters() as $adapter) {
            if (static::$flysystem->writeStream("$adapter://$filename", $resource, $config)) {
                $written_files[] = $filename;
            } else {
                # Could not replicate the file to an adapter, so delete all existing copies and fail.
                foreach ($written_files as $file) {
                    static::$flysystem->delete($file);
                }

                $adapter_labels = static::getAdapters();
                throw new WriteException("Could not store $filename in {$adapter_labels[$adapter]}.");
            }
        }

        return true;
    }

    public static function delete($filename) {
        static::loadAdapters();

        # Find an adapter that has the file.
        foreach (static::getEnabledAdapters() as $adapter) {
            if (static::$flysystem->has("$adapter://$filename")) {
                if (!static::$flysystem->delete("$adapter://$filename")) {
                    $adapter_labels = static::getAdapters();
                    throw new DeleteException("Could not delete $filename in {$adapter_labels[$adapter]}.");
                }
            }
        }

        return true;
    }

    public static function listContents($directory = '', $recursive = true) {
        static::loadAdapters();

        $contents = [];
        foreach (static::getEnabledAdapters() as $adapter) {
            foreach (static::$flysystem->listContents("$adapter://$directory", $recursive) as $file) {
                if ($file['type'] === "file") {
                    $contents[$file["path"]] = $file;
                }
            }
        }

        return $contents;
    }

    public static function has($filename) {
        static::loadAdapters();
        # Find an adapter that has the file.
        foreach (static::getEnabledAdapters() as $adapter) {
            if (static::$flysystem->has("$adapter://$filename")) {
                return true;
            }
        }

        return false;
    }

}