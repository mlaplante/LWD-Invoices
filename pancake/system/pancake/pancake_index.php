<?php

/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package             Pancake
 * @author              Pancake Dev Team
 * @copyright           Copyright (c) 2014, Pancake Payments
 * @license             http://pancakeapp.com/license
 * @link                http://pancakeapp.com
 * @since               Version 4.0
 */

try {
    if (version_compare(PHP_VERSION, "7.4.0", "lt")) {
        $versions = [
            "5.2" => [2009, 2011],
            "5.3" => [2012, 2014],
            "5.4" => [2013, 2015],
            "5.5" => [2014, 2016],
            "5.6" => [2015, 2018],
            "7.0" => [2016, 2018],
            "7.1" => [2017, 2019],
            "7.2" => [2018, 2020],
            "7.3" => [2019, 2021],
            "7.4" => [2020, 2022],
            "8.0" => [2021, 2023],
            "8.1" => [2022, 2024],
        ];
        $version = substr(PHP_VERSION, 0, 3);
        $message = "";
        $message .= "<p>You are using PHP $version, which has been out of date since {$versions[$version][0]}, and has not been supported by the PHP Group since {$versions[$version][1]}.</p>";
        $message .= "<p>By staying with this version of PHP, you're missing out on a number of performance and security improvements, as well as a countless number of bugfixes.</p>";
        $message .= "<p>You're also not making the most of Pancake.</p>";
        $message .= "<p>You should upgrade your PHP version to at least 7.4 (ideally 8.0).</p>";
        $message .= "<p>To do so, please talk to your server administrators and ask them to update PHP.</p>";
        $message .= "<h2>Notes</h2>";
        $message .= "<p>If you're running Pancake on an Apache server (if you don't know, you probably are), you might be able to change the PHP version by adding the following to the bottom of the '.htaccess' file in your Pancake folder:</p>";
        $message .= "<p><code>AddHandler application/x-httpd-php74 .php</code></p>";
        $message .= "<p>It doesn't work for every server configuration, but it might do for you.<br />If 'php74' doesn't work, try to separate the version numbers with a dash (e.g. php 7-4).</p>";
        $message .= "<p>If you're using MediaTemple for hosting, you should use this instead:</p>";
        $message .= "<p><code>AddHandler php7latest-script .php</code></p>";
        $message .= "<p>For some other web hosts, you might be able to use one of the following:</p>";
        $message .= "<p><code>AddHandler application/x-httpd-ea-php74 .php</code></p>";
        $message .= "<p><code>AddHandler application/x-lsphp74 .php</code></p>";
        $message .= "<p>If none of the above work for you, you'll have to talk to your server administrator and ask them for a more up-to-date version of PHP.</p>";
        critical_error("The version of PHP that you are using is not supported by Pancake.", $message);
    }

    # Makes sure eAccelerator is disabled.
    if (extension_loaded("eAccelerator")) {
        $message = "";
        $message .= "<p>Your server is running an extension for PHP called eAccelerator, which does not have support for certain features of the PHP language that we use in Pancake.</p>";
        $message .= "<p>When eAccelerator is enabled, it breaks Pancake.</p>";
        $message .= "<p>You should disable or uninstall eAccelerator, and switch to either <a href='http://xcache.lighttpd.net/'>XCache</a> or <a href='http://www.php.net/manual/en/book.opcache.php'>OPCache</a>.</p>";
        $message .= "<p>To do so, please talk to your server administrators and ask them to disable eAccelerator.</p>";
        critical_error("Your server cannot run Pancake.", $message);
    }

    # Makes sure everyone has the GD extension.
    if (!extension_loaded("gd")) {
        $message = "";
        $message .= "<p>Your server does not have an extension called GD, which is necessary for generating PDFs for your invoices, estimates, proposals and everything else.</p>";
        $message .= "<p>You should install and enable the GD extension.</p>";
        $message .= "<p>To do so, please talk to your server administrators and ask them to install and enable the GD extension.</p>";
        critical_error("Your server cannot run Pancake.", $message);
    }

    # Makes sure everyone has the DOM extension.
    if (!extension_loaded("dom")) {
        $message = "";
        $message .= "<p>Your server does not have an extension called DOM, which is necessary for generating PDFs for your invoices, estimates, proposals and everything else.</p>";
        $message .= "<p>You should install and enable the DOM extension.</p>";
        $message .= "<p>To do so, please talk to your server administrators and ask them to install and enable the DOM extension.</p>";
        critical_error("Your server cannot run Pancake.", $message);
    }

    # Make sure everyone has the cURL extension.
    if (!extension_loaded("curl")) {
        $message = "";
        $message .= "<p>Your server does not have an extension called cURL, which is necessary in order to accept payments and communicate with other services.</p>";
        $message .= "<p>You should install and enable the cURL extension.</p>";
        $message .= "<p>To do so, please talk to your server administrators and ask them to install and enable the cURL extension.</p>";
        critical_error("Your server cannot run Pancake.", $message);
    }

    # Makes sure everyone has MySQL or MySQLi.
    if (!function_exists("mysql_connect") && !function_exists("mysqli_connect")) {
        $message = "";
        $message .= "<p>Your server does not have an extension called <code>mysqli</code>, which means that Pancake cannot connect to the database.</p>";
        $message .= "<p>You should install <code>mysqli</code>. To do so, please talk to your server administrators and ask them to install the <code>mysqli</code> extension.</p>";
        critical_error("Your server cannot run Pancake.", $message);
    }

    # Make sure everyone has either mbstring or iconv.
    if (!extension_loaded("mbstring") && !extension_loaded("iconv")) {
        $message = "";
        $message .= "<p>Your server does not have an extension called <code>mbstring</code>, which means that Pancake cannot reliably handle text.</p>";
        $message .= "<p>In these cases, Pancake tries to fall back on an extension called <code>iconv</code>, but your server doesn't have that either.</p>";
        $message .= "<p>You should install <code>mbstring</code>. To do so, please talk to your server administrators and ask them to install the <code>mbstring</code> extension.</p>";
        critical_error("Your server cannot run Pancake.", $message);
    }

    define('SELF', pathinfo($index_file, PATHINFO_BASENAME));
    define('EXT', '.php');
    define('FCPATH', str_replace(SELF, '', $index_file));
    define('IS_CLI', defined('STDIN'));

    if (IS_CLI) {
        echo "You cannot run Pancake via the command line.".PHP_EOL;
        echo "If you are trying to run the cron job, you must use wget.".PHP_EOL;
        echo "See https://www.pancakeapp.com/documentation/cron for more information.".PHP_EOL;
        exit(1);
    }

    define("REQUEST_TIME", microtime(true));

    # Having Pancake version as 2.1.0 is NOT a mistake, it is here for backward-compatibility.
    define('PANCAKE_VERSION', '2.1.0');

    # Define environment variables.
    clearstatcache();
    define('IS_AJAX', isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) == 'xmlhttprequest');


    if (!isset($_SERVER["REMOTE_ADDR"])) {
        # It's unknown, so we assign an unroutable IP just to keep things from breaking.
        $_SERVER["REMOTE_ADDR"] = "192.0.2.0";
    }

    /**
     * Whether Pancake is in development mode.
     * Shows all errors and their details, instead of the 'Unknown Error' page.
     */
    define('IS_DEBUGGING', file_exists(FCPATH . "DEBUGGING"));

    /**
     * Whether Pancake is in profiling mode.
     * Will save all DB query timings, and append a full report on Pancake's performance to the end of the page.
     */
    define('IS_PROFILING', file_exists(FCPATH . "PROFILING") && !IS_AJAX);

    /**
     * Whether Pancake is in demo mode.
     * Will hide the license and forbid editing the language and the main user.
     */
    define('IS_DEMO', (file_exists(FCPATH . 'DEMO')));

    /**
     * Whether Pancake is being hosted for someone else.
     * Hides the license key.
     */
    define('IS_HOSTED', (file_exists(FCPATH . 'HOSTED')));

    /**
     * Whether Pancake is being hosted as a SaaS installation.
     * This will change a number of things, but right now doesn't do anything.
     */
    define('IS_SAAS', (file_exists(FCPATH . 'SAAS')));

    $policy = "default-src 'self'; script-src 'self' 'unsafe-eval' https://js.stripe.com code.jquery.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data: https://secure.gravatar.com http://www.gravatar.com; frame-src https://js.stripe.com; font-src *";
    # @todo this is still being worked on.
    # header("X-Content-Security-Policy: $policy;");
    # header("X-WebKit-CSP: $policy;");
    # header("Content-Security-Policy: $policy;");

    # Prevent clickjacking.
    header("X-Frame-Options: SAMEORIGIN");

    # Force-enable XSS protection.
    header("X-XSS-Protection: 1; mode=block");

    # Enforce content types
    header("X-Content-Type-Options: nosniff");

    # Remove PHP info.
    header_remove("X-Powered-By");

    # Make PHPSESSID httponly. We don't use it, but just in case it ever is used.
    ini_set('session.cookie_httponly', 1);

    # This is here for backward-compatibility purposes.
    define('PANCAKE_DEMO', IS_DEMO);
    define('PANCAKE_HOSTED', IS_HOSTED);

    @ini_set('memory_limit', '1024M');

    # This is here to fix an odd CI bug with special characters.
    $post_buffer = $_POST;

    # This can no longer be modified; please don't change it.
    define('ENVIRONMENT', 'development');

    # @ is used here to prevent errors with some of the stricter hosts who disable ini_set.
    @ini_set('display_errors', true);
    error_reporting(-1);

    $system_path = FCPATH . "system/codeigniter";
    $application_folder = FCPATH . "system/pancake";

    if (is_file($application_folder . '/config/database.php')) {
        file_get_contents($application_folder . '/config/database.php') or $application_folder = FCPATH . "installer";
    } else {
        $application_folder = FCPATH . "installer";
    }

    define('INSTALLING_PANCAKE', ($application_folder == FCPATH . "installer"));

    if (realpath($system_path) !== false) {
        $system_path = realpath($system_path) . '/';
    }

    $system_path = rtrim($system_path, '/') . '/';

    if (!is_dir($system_path)) {
        pancake_system_folder_error($system_path);
    }

    define('BASEPATH', str_replace("\\", "/", $system_path));
    define('SYSDIR', trim(strrchr(trim(BASEPATH, '/'), '/'), '/'));

    if (is_dir($application_folder)) {
        define('APPPATH', $application_folder . '/');
    } else {
        if (!is_dir(BASEPATH . $application_folder . '/')) {
            pancake_application_folder_error($application_folder);
        }

        define('APPPATH', BASEPATH . $application_folder . '/');
    }

    # If Pancake is under maintenance show the maintenance page.
    handle_maintenance();

    # Make sure that if Pancake is using mysqli, it exists and is loaded.
    test_mysqli();

    # Require exceptions before autoloading, in order to report deprecation notices while autoloading.
    require_once BASEPATH . '/core/Exceptions.php';
    require_once APPPATH . 'core/Pancake_Exceptions.php';
    $e = new Pancake_Exceptions();

    # This file is not included because it contains 5.3+ code that would prevent us
    # from displaying the "unsupported PHP" error at the top of this file.
    require_once dirname(__FILE__) . '/../vendor/autoload.php';

    # Load CodeIgniter.
    require_once BASEPATH . 'core/CodeIgniter.php';
} catch (Throwable $e) {
    require_once BASEPATH . '/core/Exceptions.php';
    require_once APPPATH . 'core/Pancake_Exceptions.php';
    Pancake_Exceptions::exception_handler($e);
}

function test_mysqli() {
    $active_group = "default";
    $db = array();
    include APPPATH . "config/database.php";

    if (!function_exists("mysql_connect") && !function_exists("mysqli_connect")) {
        echo "<!doctype HTML><html><head><style>body{font-family: sans-serif;margin: 4em;} li {margin-bottom: 1em;} code {padding: 4px; display:inline-block; border-radius: 4px; background: #333; color: white;}</style></head><body>";
        echo "<h1>Your server cannot run Pancake.</h1>";
        echo "<p>Your server does not have an extension called <code>mysqli</code>, which means that Pancake cannot connect to the database.</p>";
        echo "<p>You should install <code>mysqli</code>. To do so, please talk to your server administrators and ask them to install the <code>mysqli</code> extension.</p>";
        echo "</body></html>";
        die;
    }
}

function is_php($version = '5.0.0') {
    static $_is_php = array();
    $version = (string) $version;

    if (!isset($_is_php[$version])) {
        $_is_php[$version] = (version_compare(PHP_VERSION, $version) < 0) ? false : true;
    }

    return $_is_php[$version];
}

function pancake_application_folder_error($application_folder) {
    exit("<h3>Pancake is having problems figuring out what the path to the application folder is.</h3>
            It thinks the path is: $application_folder<br><br>
            If this is incorrect, there is a line in the file index.php that has
            <code># \$application_folder = '/your/path/here/system/pancake';</code>.
            <br><br> Remove the hash sign and replace /your/path/here/system/pancake with the correct path to the system/pancake folder.
            <br><br>Windows users, use forward slashes.
            <br><br>NOTE: If you haven't installed Pancake yet, the application path should be /your/path/here/installer");
}

function pancake_system_folder_error($system_path) {
    exit("<h3>Pancake is having problems figuring out what the path to the system folder is.</h3> It thinks the path is: $system_path<br><br>If this is incorrect, there is a line in the file index.php that has <code># \$system_path = '/your/path/here/system/codeigniter';</code>.<br><br> Remove the hash sign and replace /your/path/here/system/codeigniter with the correct path to the system/codeigniter folder. <br><br>Windows users, use forward slashes.");
}

/**
 * If $server is a string, it assumes it's a base64_encoded serialized dump of $_SERVER
 * and alters $_SERVER to match it. Used for debugging installation errors in Pancake.
 * If $server is an array, it'll return it in a debuggable format.
 *
 * @param string  $server
 * @param boolean $process
 *
 * @return string
 */
function debug_server($server) {
    if (is_array($server)) {
        return chunk_split(base64_encode(serialize($server)));
    } else {
        $server = trim($server);
        $server = base64_decode($server);
        $unserialize_server = @unserialize($server);
        if ($unserialize_server !== false) {
            $_SERVER = $unserialize_server;
        } else {
            if (substr($server, 0, 7) == "array (") {
                eval("\$server = " . $server . ";");
                $_SERVER = $server;
            } else {
                throw new Exception("Could not unserialize debug server.");
            }
        }
    }
}

function handle_maintenance() {
    $under_maintenance = false;

    if (file_exists(APPPATH . "maintenance.php")) {
        require APPPATH . "maintenance.php";

        if ($under_maintenance) {
            $title = 'Under Maintenance';
            $enduser_message = "<p>Pancake is updating.<br>It should only take a few seconds.<br>Feel free to refresh to see if it's back up.</p>";
	        $enduser_message .= "<p style='text-align: left; border-top: 1px solid #ddd;padding-top: 16px; border-bottom: 1px solid #ddd;padding-bottom: 16px;margin-bottom: 16px;'>If it's been a while and Pancake doesn't come out of maintenance mode, it might be that something prevented it from finishing correctly.<br /><br />This can happen with big updates in some web hosts. You can resolve it by updating manually.</p>";
	        $enduser_message .= "<p><a href='https://www.pancakeapp.com/faq/manual-update' class='btn'>How to do a manual update</a></p>";
	        require APPPATH . 'errors/error_php_enduser.php';
            die;
        }
    }
}

function debug()
{
    # Load Composer autoload if it hasn't yet been loaded, to grab dd().
    require_once dirname(__FILE__) . '/../vendor/autoload.php';

    if (!headers_sent()) {
        header_remove("Cache-Control");
        header("Content-Type: text/html");
        header_remove("Content-Disposition");
    }

    while (ob_get_level()) {
        ob_end_clean();
    }

    if (function_exists("dd")) {
        dd(func_get_args());
    } else {
        $i = 1;

        $raw_title = "<div style='font-family:Helvetica, Arial, sans-serif;background:black;color:white;padding:1em;'>%s</div>";
        $raw_pre = "<pre style='white-space: pre-wrap; word-wrap: break-word;'>%s</pre>";

        foreach (func_get_args() as $arg) {

            ob_start();
            var_dump($arg);
            $dumped_arg = ob_get_contents();
            ob_end_clean();

            $type = gettype($arg);
            $just_echo = false;

            switch ($type) {
                case 'array':
                    $details = "Array with " . count($arg) . " elements";

                    if (array_values($arg) === $arg) {
                        $is_implodable = true;
                        foreach (array_values($arg) as $value) {
                            if (gettype($value) != 'string') {
                                $is_implodable = false;
                            }
                        }
                        if ($is_implodable) {
                            $arg = "array('" . implode("', '", $arg) . "')";
                            $just_echo = true;
                        }
                    }

                    echo sprintf($raw_title, "Argument #$i (" . $details . ")");
                    echo "<div style='font-family:Helvetica, Arial, sans-serif;border:1px solid black;padding:1em 2em;margin-bottom: 1em;'><h2>Export</h2>";
                    if ($just_echo) {
                        printf($raw_pre, $arg);
                    } else {
                        printf($raw_pre, "\$arg = " . var_export($arg, true) . ";");
                    }
                    echo "<h2>Dump</h2>" . sprintf($raw_pre, $dumped_arg) . "</div>";

                    break;
                case 'boolean':
                    echo sprintf($raw_title, "Argument #$i (Boolean) - " . var_export($arg, true));
                    break;
                case 'string':
                    echo sprintf($raw_title, "Argument #$i (String) - " . var_export($arg, true));
                    break;
                case 'integer':
                    echo sprintf($raw_title, "Argument #$i (Integer) - " . var_export($arg, true));
                    break;
                default:
                    $details = ucwords($type);

                    echo sprintf($raw_title, "Argument #$i (" . $details . ")");
                    echo "<div style='font-family:Helvetica, Arial, sans-serif;border:1px solid black;padding:1em 2em;margin-bottom: 1em;'><h2>Export</h2>";
                    if ($just_echo) {
                        printf($raw_pre, $arg);
                    } else {
                        printf($raw_pre, "\$arg = " . var_export($arg, true) . ";");
                    }
                    echo "<h2>Dump</h2>" . sprintf($raw_pre, $dumped_arg) . "</div>";

                    break;
            }

            $i++;
        }
        die;
    }
}

/**
 * Shows a critical error page, with some basic styling.
 * Used for errors which prevent the correct loading of Pancake.
 *
 * @param string $title
 * @param string $details
 */
function critical_error($title, $details) {
    echo "<!doctype HTML><html><head><title>$title</title><style>body{font-family: sans-serif;margin: 4em;} li {margin-bottom: 1em;} code {padding: 4px; display:inline-block; border-radius: 4px; background: #333; color: white;}</style></head><body>";
    echo "<h1>$title</h1>";
    echo $details;
    echo "</body></html>";
    die;
}

/**
 * Is CLI?
 * Test to see if a request was made from the command line.
 *
 * @return    bool
 */
function is_cli() {
    return (PHP_SAPI === 'cli' OR defined('STDIN'));
}