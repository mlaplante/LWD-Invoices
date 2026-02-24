<?php

defined('BASEPATH') OR exit('No direct script access allowed');
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
 * Settings library for easily accessing them
 *
 * @subpackage    Libraries
 * @category      Settings
 */
class Settings {

    /**
     * @var    object    The CI global object
     */
    private $_ci;

    /**
     * @var    array    Holds the settings from the db
     */
    private static $_settings = array();

    /**
     * @var    array    Holds the taxes from the db
     */
    private static $_taxes = array();

    /**
     * @var    array    Holds the taxes from the db
     */
    private static $_currencies = array();
    protected static $_sensitive_settings = array(
        "ftp_host",
        "ftp_pass",
        "ftp_pasv",
        "ftp_path",
        "ftp_port",
        "ftp_user",
        "latest_blogpost",
        "license_key",
        "main_warning",
        "mailpath",
        "rss_password",
        "smtp_host",
        "smtp_pass",
        "smtp_port",
        "smtp_encryption",
        "smtp_user",
        "smtp_use_tls",
        "store_auth_email",
        "store_auth_token",
        "tls_smtp_host",
        "tls_smtp_pass",
        "tls_smtp_port",
        "tls_smtp_user",
        "top_warning",
        "version_list",
    );

    // ------------------------------------------------------------------------

    /**
     * Loads in the CI global object and loads the settings module
     *
     * @access    public
     * @return    void
     */
    public function __construct() {
        $this->_ci = &get_instance();
        $this->_ci->load->model('settings/settings_m');
        $this->_ci->load->model('settings/tax_m');
        $this->_ci->load->model('settings/currency_m');

        $this->reload();
    }

    // ------------------------------------------------------------------------

    /**
     * This allows you to get the settings like this:
     * $this->settings->setting_name
     *
     * @access    public
     *
     * @param    string    The name of the setting
     *
     * @return    string    The setting value
     */
    public function __get($name) {
        return Settings::get($name);
    }

    public static function setVersion($version) {
        return self::set('version', $version);
    }

    public static function get_tax_percentage($tax_id) {
        if (isset(Settings::$_taxes[$tax_id])) {
            return Settings::$_taxes[$tax_id]['value'];
        } else {
            return null;
        }
    }

    public static function get_tax($percentage, $name = '') {
        $CI = &get_instance();
        $taxes = $CI->db->where('value', $percentage)->get('taxes')->result_array();

        if (count($taxes) == 0) {
            $CI->db->insert('taxes', array(
                'name' => empty($name) ? 'Tax' : $name,
                'value' => $percentage,
            ));

            $id = $CI->db->insert_id();
            $CI->settings->reload();

            return $id;
        } else {
            foreach ($taxes as $record) {
                if (empty($name)) {
                    return (int) $record['id'];
                } else {
                    if ($record['name'] == $name) {
                        return (int) $record['id'];
                    }
                }
            }

            if (!empty($name)) {
                # Name is not empty and no tax with the same name was yet found, so let's create one.
                $CI->db->insert('taxes', array(
                    'name' => empty($name) ? 'Tax' : $name,
                    'value' => $percentage,
                ));
                $taxes = $CI->db->where('value', $percentage)->where('name', $name)->get('taxes')->row_array();
                $id = (int) $taxes['id'];

                $CI->settings->reload();
                return $id;
            }
        }
    }

    public static function set($name, $value) {
        $CI = get_instance();

        if (stristr($name, ".") !== false) {
            throw new Exception("Settings cannot contain periods in their name (they are reserved for chunked settings). Trying to set '$name'.");
        }

        # If the $value is greater than 10KB, we need to check out MySQL's limit to decide whether or not to chunk it.
        if (strlen($value) > 1024 * 10) {
            $mysql_limits = $CI->db->query("select @@max_allowed_packet, @@innodb_log_file_size")->row_array();
            $max_allowed_packet = $mysql_limits['@@max_allowed_packet'] * 0.7; # Set it to 70% of the maximum allowed packet size to avoid going over it.
            $innodb_log_limit = $mysql_limits['@@innodb_log_file_size'] * 0.1; # Can't be more than 10%, causes "The size of BLOB/TEXT data inserted in one transaction is greater than 10% of redo log size."

            # Obey the lowest of the limits.
            $max_chunk_size = intval(min($max_allowed_packet, $innodb_log_limit));
        } else {
            # Don't chunk the value because it's not big enough to incur that performance hit.
            $max_chunk_size = PHP_INT_MAX;
        }

        # Split the value into chunks. For most settings this won't be chunked at all.
        # But for something like the update system, this will fix a "max_allowed_packet" issue with some servers.
        $chunks = str_split($value, $max_chunk_size);

        if (count($chunks) == 1) {
            if (!array_key_exists($name, Settings::$_settings)) {
                try {
                    $CI->db->insert("settings", array("slug" => $name, "value" => ""));
                } catch (QueryException $e) {
                    if ($e->getCode() === QueryException::ER_DUP_ENTRY) {
                        # This item already exists, we can ignore it.
                    } else {
                        throw $e;
                    }
                }
            }

            $CI->db->where("slug", $name)->update("settings", array("value" => $value));
        } else {
            # Delete all existing chunks.
            $CI->db->like("slug", $name, 'after')->delete("settings");

            foreach ($chunks as $i => $chunk) {
                $CI->db->insert("settings", array(
                    "slug" => $name . '.' . $i . '.part',
                    "value" => $chunk,
                ));
            }
        }

        $CI->settings->reload();
        return true;
    }

    public function __set($name, $value) {
        self::set($name, $value);
    }

    // ------------------------------------------------------------------------

    /**
     * This allows you to get the settings like this, which is ideal for
     * use in views:
     * Settings::get('setting_name');
     *
     * @static
     * @access    public
     *
     * @param    string    The name of the setting
     *
     * @return    string    The setting value
     */
    public static function get($name) {
        if (!array_key_exists($name, Settings::$_settings)) {
            return false;
        }
        return trim(Settings::$_settings[$name]);
    }

    public static function get_latest_blog_post() {
        $latest_blogpost = Settings::get("latest_blogpost");
        $return = false;
        if ($latest_blogpost) {
            $return = json_decode($latest_blogpost, true);
        }
        return $return;
    }

    public static function get_encryption_key()
    {
        if (!Settings::get("encryption_key")) {
            Settings::set("encryption_key", md5(random_bytes(32)));
        }

        return Settings::get("encryption_key");
    }

    public static function create($name, $value) {
        return static::set($name, $value);
    }

    public static function delete($name) {
        $CI = &get_instance();
        $result = $CI->db->where('slug', $name)->delete('settings');
        $CI->settings->reload();
        return $result;
    }

    // ------------------------------------------------------------------------

    /**
     * Returns all of the settings, excluding the sensitive settings like FTP, License, Email, etc.
     *
     * @access    public
     * @return    array    An array containing all the settings
     */
    public static function get_all() {
        static $return = null;

        if ($return === null) {
            $return = array();
            foreach (self::$_settings as $setting_name => $setting_value) {
                if (!in_array($setting_name, self::$_sensitive_settings)) {
                    $return[$setting_name] = $setting_value;
                }
            }
        }

        return $return;
    }

    /**
     * Returns all of the settings, including the sensitive settings like FTP, License, Email, etc.
     *
     * @access    public
     * @return    array    An array containing all the settings
     */
    public static function get_all_including_sensitive() {
        return self::$_settings;
    }

    // ------------------------------------------------------------------------

    /**
     * Returns all of the taxes
     *
     * @access    public
     * @return    array    An array containing all the settings
     */
    public static function all_taxes() {
        return Settings::$_taxes;
    }

    // ------------------------------------------------------------------------

    /**
     * Returns all of the taxes
     *
     * @access    public
     * @return    array    An array containing all the currencies
     */
    public static function all_currencies() {
        return Settings::$_currencies;
    }

    // ------------------------------------------------------------------------

    /**
     * This allows you to get the currency like this, which is ideal for
     * use in views:
     * Settings::currency(1);
     *
     * @static
     * @access    public
     *
     * @param    string    The id of the tax
     *
     * @return    string    The tax
     */
    public static function currency($id) {
        if (!array_key_exists($id, Settings::$_currencies)) {
            return false;
        }
        return Settings::$_currencies[$id];
    }

    // ------------------------------------------------------------------------

    /**
     * This allows you to get the tax like this, which is ideal for
     * use in views:
     * Settings::tax(1);
     *
     * @static
     * @access    public
     *
     * @param    string    The id of the tax
     *
     * @return    string    The tax
     */
    public static function tax($id) {
        if (!array_key_exists($id, Settings::$_taxes)) {
            return false;
        }
        return Settings::$_taxes[$id];
    }

    // ------------------------------------------------------------------------

    /**
     * Gets the dropdown for all the taxes
     *
     * @static
     * @access    public
     * @return    array    The tax dropdown array
     */
    public static function tax_dropdown() {
        $return = array(0 => __("settings:no_tax"));

        foreach (Settings::$_taxes as $id => $tax) {
            $return[$id] = $tax['name'] . ' (' . $tax['value'] . '%)';
        }
        return $return;
    }

    /**
     * Gets the dropdown for all the currencies.
     *
     * @static
     * @access    public
     * @return    array    The currencies dropdown array
     */
    public static function currencies_dropdown() {
        $base_currency = Currency::get();
        $currencies = array(__('currencies:default', array(__($base_currency['name']))));
        foreach (static::all_currencies() as $currency) {
            $currencies[$currency['code']] = $currency['name'];
        }
        return $currencies;
    }

    public static function get_default_tax_ids() {
        $buffer = explode(",", Settings::get('default_tax_id'));
        $return = array();
        foreach ($buffer as $id) {
            $return[$id] = $id;
        }

        return $return;
    }

    protected function refresh_version() {
        $name = "version";
        $real_version = file_get_contents(APPPATH . 'VERSION');
        if (isset(Settings::$_settings[$name])) {
            if (Settings::$_settings[$name] != $real_version) {
                $this->_ci->db->where('slug', $name)->update('settings', array('value' => $real_version));
            }
        } else {
            $this->_ci->db->insert('settings', array('slug' => $name, 'value' => $real_version));
        }

        Settings::$_settings[$name] = $real_version;
    }

    /**
     * Sets the timezone to be used for dates with date_default_timezone_set().
     *
     * Updates the current timezone setting if needed, to an up-to-date timezone identifier.
     */
    protected function refresh_timezone() {
        $name = "timezone";

        $timezone = Settings::get('timezone');
        $identifiers = DateTimeZone::listIdentifiers();
        if (!in_array($timezone, $identifiers)) {
            $new_timezone = $timezone;

            switch ($timezone) {
                case "America/Indianapolis":
                    $new_timezone = "America/Indiana/Indianapolis";
                    break;
                case "America/Indiana/Indianapolis":
                    $new_timezone = "America/Indianapolis";
                    break;
                case "America/Buenos_Aires":
                    $new_timezone = "America/Argentina/Buenos_Aires";
                    break;
                case "America/Argentina/Buenos_Aires":
                    $new_timezone = "America/Buenos_Aires";
                    break;
                case "Asia/Kolkata":
                    $new_timezone = "Asia/Calcutta";
                    break;
                case "Asia/Calcutta":
                    $new_timezone = "Asia/Kolkata";
                    break;
                case "Asia/Kathmandu":
                    $new_timezone = "Asia/Katmandu";
                    break;
                case "Asia/Katmandu":
                    $new_timezone = "Asia/Kathmandu";
                    break;
                case "Asia/Yangon":
                    $new_timezone = "Asia/Rangoon";
                    break;
                case "Asia/Rangoon":
                    $new_timezone = "Asia/Yangon";
                    break;
                default:
                    throw_exception("The timezone '$timezone' is not valid.");
                    break;
            }

            $timezone = $new_timezone;
        }

        if (isset(Settings::$_settings[$name])) {
            if (Settings::$_settings[$name] != $timezone) {
                $this->_ci->db->where('slug', $name)->update('settings', array('value' => $timezone));
            }
        } else {
            $this->_ci->db->insert('settings', array('slug' => $name, 'value' => $timezone));
        }

        Settings::$_settings[$name] = $timezone;
        date_default_timezone_set($timezone);
    }

    protected function refresh_kitchen_route() {
        $name = "kitchen_route";

        if (file_exists(FCPATH . 'uploads/kitchen_route.txt')) {
            $real_kitchen_route = file_get_contents(FCPATH . 'uploads/kitchen_route.txt');
            $real_kitchen_route = empty($real_kitchen_route) ? 'client_area' : $real_kitchen_route;
        } else {
            $real_kitchen_route = 'client_area';
        }

        if (isset(Settings::$_settings[$name])) {
            if (Settings::$_settings[$name] != $real_kitchen_route) {
                $this->_ci->db->where('slug', $name)->update('settings', array('value' => $real_kitchen_route));
            }
        } else {
            $this->_ci->db->insert('settings', array('slug' => $name, 'value' => $real_kitchen_route));
        }

        Settings::$_settings[$name] = $real_kitchen_route;
    }

    // ------------------------------------------------------------------------

    /**
     * This reloads the settings in from the database.
     *
     * @access    public
     * @return    void
     */
    public function reload() {
        Settings::$_taxes = array();
        Settings::$_currencies = array();
        Settings::$_settings = array();

        $chunked_settings = array();

        foreach ($this->_ci->settings_m->get_all() as $setting) {
            if (substr($setting->slug, -strlen(".part")) == ".part") {
                $name = explode(".", $setting->slug);
                if (!isset($chunked_settings[$name[0]])) {
                    $chunked_settings[$name[0]] = array();
                }

                $chunked_settings[$name[0]][$setting->slug] = $setting->value;
            } else {
                Settings::$_settings[$setting->slug] = $setting->value;
            }
        }

        foreach ($chunked_settings as $setting => $chunks) {
            uksort($chunks, function ($a, $b) {
                return strnatcasecmp($a, $b);
            });

            Settings::$_settings[$setting] = "";

            foreach ($chunks as $chunk) {
                Settings::$_settings[$setting] .= $chunk;
            }
        }

        $this->refresh_version();
        $this->refresh_kitchen_route();
        $this->refresh_timezone();

        foreach ($this->_ci->tax_m->get_all() as $tax) {
            Settings::$_taxes[$tax->id] = array(
                'name' => $tax->name,
                'value' => $tax->value,
                'is_compound' => isset($tax->is_compound) ? $tax->is_compound : 0,
            );

            if (isset($tax->reg)) {
                Settings::$_taxes[$tax->id]['reg'] = $tax->reg;
            }
        }

        $versions_without_currencies = array('1.0', '1.1', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '2.0', '2.0.1', '2.0.2');

        if (in_array(Settings::$_settings['version'], $versions_without_currencies)) {
            # This version does not have currencies, but needs to work till the upgrade is over.
            $currencies = array();
        } else {
            $currencies = @$this->_ci->currency_m->get_all();
        }

        foreach ($currencies as $currency) {
            Settings::$_currencies[$currency->id] = array(
                'name' => $currency->name,
                'code' => $currency->code,
                'rate' => $currency->rate,
                'format' => isset($currency->format) ? $currency->format : '',
            );
        }
    }

    public static function fiscal_year_start(): \Carbon\Carbon
    {
        $start_day = Settings::get("year_start_day");
        $start_month = Settings::get("year_start_month");

        $this_year = Carbon\Carbon::createFromFormat("m-d", "$start_month-$start_day");
        $last_year = $this_year->copy()->subYear();

        if ($this_year->isPast()) {
            # Fiscal Year started this year (e.g. It's September 2014 and it started on April 6th 2014
            return $this_year;
        } else {
            # Fiscal Year started last year (e.g. It's January 2014 and it started on April 6th 2013).
            return $last_year;
        }
    }

}

/* End of file: Settings.php */