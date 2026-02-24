<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2010, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link           http://pancakeapp.com
 * @since          Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * Installer Library
 *
 * @subpackage    Libraries
 * @category      Installer
 */
class Installer {

    /**
     * @var    object    The global CI object
     */
    private $_ci;

    public $dbdriver = 'mysqli';

    /**
     * Loads in the CI super object
     *
     * @access    public
     * @return    void
     */
    public function __construct() {
        $this->_ci = &get_instance();

        if (!function_exists('mysqli_connect')) {
            $this->dbdriver = 'mysql';
        }
    }

    public function detect_available_charsets() {

    }

    public function install($config, $username, $password) {
        $config['dbdriver'] = $this->dbdriver;
        $config['db_debug'] = true;
        $config['char_set'] = "utf8";
        $config['dbcollat'] = "utf8_general_ci";
        $config['autoinit'] = true;

        $this->_ci->load->database($config);
        $this->_ci->load->dbforge();
        $has_utf8mb4 = $this->_ci->db->query("show character set where charset = 'utf8mb4'")->num_rows() > 0;

        if ($has_utf8mb4) {
            $config['char_set'] = "utf8mb4";
            $config['dbcollat'] = "utf8mb4_general_ci";
        }

        $schema = file_get_contents(APPPATH . 'schema/pancake.sql');

        if (!$this->_write_db_config($config, $has_utf8mb4)) {
            return false;
        }

        $data["username"] = $username;
        $data["password"] = $password;

        $data['salt'] = substr(md5(uniqid(rand(), true)), 0, 10);
        $data['password'] = sha1($data['password'] . $data['salt']);

        $data['dbprefix'] = $config['dbprefix'];
        $data['version'] = file_get_contents(FCPATH . 'system/pancake/VERSION');
        $data['rss_password'] = random_string('alnum', 12);
        $data['timezone'] = @date_default_timezone_get();

        // Include migration config to know which migration to start from
        include './system/pancake/config/migration.php';

        $data['migration'] = $config['migration_version'];
        $data['now'] = time();
        $data['now_datetime'] = date("Y-m-d H:i:s");

        $this->_ci->config->load("license");

        $data["site_name"] = "Pancake";
        $data["first_name"] = $this->_ci->config->item("first_name");
        $data["notify_email"] = $this->_ci->config->item("email");
        $data["last_name"] = $this->_ci->config->item("last_name");
        $data["license_key"] = $this->_ci->config->item("license_key");
        $data["currency"] = "USD";
        $data["tax_rate"] = "0";
        $data["theme"] = "flat-pancake";
        $data["mailing_address"] = "";

        foreach ($data as $key => $val) {

            if (strtoupper($key) == "TAX_RATE") {
                // Fixes an issue with MySQL in Strict Mode if the tax was empty.
                $val = (float) $val;
            }

            $escaped_val = $this->_ci->db->escape_str($val);
            $schema = str_replace('{' . strtoupper($key) . '}', $escaped_val, $schema);
        }

        $schema = explode('-- split --', $schema);

        foreach ($schema as $query) {
            $query = str_ireplace("charset = utf8", "charset = utf8mb4", $query);
            $query = str_ireplace("character set utf8", "character set utf8mb4", $query);
            $query = str_ireplace("collate utf8_bin", "collate utf8mb4_bin", $query);

            if (!$this->_ci->db->query(rtrim(trim($query), "\n;"))) {

                switch ($this->dbdriver) {
                    case 'mysql':
                        $error = mysql_error();
                        break;
                    case 'mysqli':
                        $error = mysqli_error($this->_ci->db->conn_id);
                        break;
                }

                show_error(strtoupper($this->dbdriver) . ' ERROR: ' . $error);
            }
        }

        $this->_ci->load->helper("cookie");

        set_cookie(array(
            'name' => 'identity',
            'value' => $username,
            'expire' => 60 * 60 * 24 * 365 * 2,
        ));

        $salt = sha1($password);
        $this->_ci->db->update("users", ['remember_code' => $salt]);

        set_cookie(array(
            'name' => 'remember_code',
            'value' => $salt,
            'expire' => 60 * 60 * 24 * 365 * 2,
        ));

        return true;
    }

    private function _write_db_config($config, $has_utf8mb4) {
        $replace = array(
            '{HOSTNAME}' => $config['hostname'],
            '{USERNAME}' => $config['username'],
            '{PASSWORD}' => $config['password'],
            '{DATABASE}' => $config['database'],
            '{PORT}' => $config['port'],
            '{DBPREFIX}' => $config['dbprefix'],
        );

        $charset = $has_utf8mb4 ? "utf8mb4" : "utf8";

        $template = <<<TEMP
<?php  if ( ! defined('BASEPATH')) exit('No direct script access allowed');
/*
| -------------------------------------------------------------------
| DATABASE CONNECTIVITY SETTINGS
| -------------------------------------------------------------------
| This file will contain the settings needed to access your database.
|
| For complete instructions please consult the 'Database Connection'
| page of the User Guide.
|
| -------------------------------------------------------------------
| EXPLANATION OF VARIABLES
| -------------------------------------------------------------------
|
|    ['hostname'] The hostname of your database server.
|    ['username'] The username used to connect to the database
|    ['password'] The password used to connect to the database
|    ['database'] The name of the database you want to connect to
|    ['dbdriver'] The database type. ie: mysql.  Currently supported:
                 mysql, mysqli, postgre, odbc, mssql, sqlite, oci8
|    ['dbprefix'] You can add an optional prefix, which will be added
|                 to the table name when using the  Active Record class
|    ['pconnect'] TRUE/FALSE - Whether to use a persistent connection
|    ['db_debug'] TRUE/FALSE - Whether database errors should be displayed.
|    ['cache_on'] TRUE/FALSE - Enables/disables query caching
|    ['cachedir'] The path to the folder where cache files should be stored
|    ['char_set'] The character set used in communicating with the database
|    ['dbcollat'] The character collation used in communicating with the database
|    ['swap_pre'] A default table prefix that should be swapped with the dbprefix
|    ['autoinit'] Whether or not to automatically initialize the database.
|    ['stricton'] TRUE/FALSE - forces 'Strict Mode' connections
|                            - good for ensuring strict SQL while developing
|
| The \$active_group variable lets you choose which connection group to
| make active.  By default there is only one group (the 'default' group).
|
| The \$active_record variables lets you determine whether or not to load
| the active record class
*/

\$active_group = 'default';
\$active_record = TRUE;

\$db['default']['hostname'] = '{HOSTNAME}';
\$db['default']['username'] = '{USERNAME}';
\$db['default']['password'] = '{PASSWORD}';
\$db['default']['database'] = '{DATABASE}';
\$db['default']['dbdriver'] = '{$this->dbdriver}';
\$db['default']['dbprefix'] = '{DBPREFIX}';
\$db['default']['pconnect'] = FALSE;
\$db['default']['db_debug'] = TRUE;
\$db['default']['cache_on'] = FALSE;
\$db['default']['cachedir'] = '';
\$db['default']['char_set'] = '$charset';
\$db['default']['dbcollat'] = '{$charset}_general_ci';
\$db['default']['swap_pre'] = '';
\$db['default']['autoinit'] = TRUE;
\$db['default']['stricton'] = TRUE;
\$db['default']['port']       = {PORT};

/* End of file database.php */
/* Location: ./application/config/database.php */
TEMP;

        $new_file = str_replace(array_keys($replace), $replace, $template);

        $handle = @fopen(FCPATH . 'system/pancake/config/database.php', 'w+');

        if ($handle !== false) {
            return @fwrite($handle, $new_file);
        }

        return false;
    }
}

/* End of file installer.php */