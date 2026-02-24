<?php

if (!defined('BASEPATH'))
    exit('No direct script access allowed');

/*
  |--------------------------------------------------------------------------
  | File and Directory Modes
  |--------------------------------------------------------------------------
  |
  | These prefs are used when checking and setting modes when working
  | with the file system.  The defaults are fine on servers with proper
  | security, but you may wish (or even need) to change the values in
  | certain environments (Apache running a separate process for each
  | user, PHP under CGI with Apache suEXEC, etc.).  Octal values should
  | always be used to set the mode correctly.
  |
 */
define('FILE_READ_MODE', 0644);
define('FILE_WRITE_MODE', 0666);
define('DIR_READ_MODE', 0755);
define('DIR_WRITE_MODE', 0777);

/*
  |--------------------------------------------------------------------------
  | File Stream Modes
  |--------------------------------------------------------------------------
  |
  | These modes are used when working with fopen()/popen()
  |
 */

define('FOPEN_READ', 'rb');
define('FOPEN_READ_WRITE', 'r+b');
define('FOPEN_WRITE_CREATE_DESTRUCTIVE', 'wb'); // truncates existing file data, use with care
define('FOPEN_READ_WRITE_CREATE_DESTRUCTIVE', 'w+b'); // truncates existing file data, use with care
define('FOPEN_WRITE_CREATE', 'ab');
define('FOPEN_READ_WRITE_CREATE', 'a+b');
define('FOPEN_WRITE_CREATE_STRICT', 'xb');
define('FOPEN_READ_WRITE_CREATE_STRICT', 'x+b');

require 'base_url.php';
$details = detect_base_url($_SERVER, FCPATH);
define('BASE_URL', $details['url']);
define('IS_SSL', $details['is_ssl']);
define('SCHEME', IS_SSL ? 'https' : 'http');
$_SERVER = $details['server'];

# Setting this here to sort out a bug that crops up with using date('Y') before setting a timezone.
# This is overriden as Pancake is loading, so it's not a problem.
date_default_timezone_set('Europe/London');
define('COPYRIGHT_YEAR', date('Y'));

# Store Plugin Types
define('STORE_TYPE_PLUGIN', 1);
define('STORE_TYPE_GATEWAY', 2);
define('STORE_TYPE_FRONTEND_THEME', 3);
define('STORE_TYPE_BACKEND_THEME', 4);
define('STORE_INVALID_AUTH', 1000);
define('STORE_ALREADY_PURCHASED', 1001);
define('STORE_FAILED_CREDIT_CARD', 1002);
define('STORE_INVALID_REQUEST_ERROR', 1003);
define('STORE_TEMPORARY_ERROR', 1004);
define('STORE_NO_WRITE_PERMISSIONS', 1005);

# Upload Errors
define('NOT_ALLOWED', 'NOT_ALLOWED');

# Temporary Storage Folder
$temporary_directory = sys_get_temp_dir() . "pancake" . DIRECTORY_SEPARATOR;
@mkdir($temporary_directory);
$test_file = $temporary_directory . "test." . time() . ".txt";
@touch($test_file);
$is_writable = @file_exists($test_file);
if ($is_writable) {
    @unlink($test_file);
} else {
    $temporary_directory = FCPATH . "uploads" . DIRECTORY_SEPARATOR;
}
define("PANCAKE_TEMP_DIR", $temporary_directory);

# Testing Payments
define('USE_SANDBOX', false);

# This is here to ensure compatibility with custom themes.
define('CAN_USE_MBSTRING', true);

define("PANCAKEAPP_COM_BASE_URL", "https://www.pancakeapp.com/");
define("MANAGE_PANCAKE_BASE_URL", "http://manage.pancakeapp.com/");

define('MUSTACHE_EXT', '.mustache.html');

if (!defined('CURL_SSLVERSION_TLSv1_2')) {
    define('CURL_SSLVERSION_TLSv1_2', 6);
}

/* End of file constants.php */
/* Location: ./application/config/constants.php */
