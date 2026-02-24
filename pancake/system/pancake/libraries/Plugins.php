<?php defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Central library for Plugin logic
 *
 * @property      Clients_m                     $clients_m
 * @property      Invoice_m                     $invoice_m
 * @property      Project_m                     $project_m
 * @property      CI_Loader                     $load
 * @property      Project_task_m                $project_task_m
 * @property      Update_system_m               $update
 * @property      Store_m                       $store_m
 * @property      CI_DB_query_builder           $db
 * @property      Template                      $template
 * @property      User_m                        $user_m
 * @property      Business_identities_m         $business_identities_m
 * @property      Settings_m                    $settings_m
 * @property      Currency_m                    $currency_m
 * @property      Partial_payments_m            $ppm
 * @property      Project_expense_m             $project_expense_m
 * @property      Clients_credit_alterations_m  $clients_credit_alterations_m
 * @property      CI_Benchmark                  $benchmark
 * @property      Update_system_m               $update_system_m
 * @property      Proposals_m                   $proposals_m
 * @property      \Pancake\Mustache\Mustache    $mustache
 * @property      Ion_auth                      $ion_auth
 * @property      CI_Config                     $config
 * @property      CI_Session                    $session
 * @property      Project_time_m                $project_time_m
 * @property      Files_m                       $files_m
 * @property      CI_Form_validation            $form_validation
 * @property      Assignments                   $assignments
 * @property      Pie_m                         $pie
 * @property      Expenses_categories_m         $expenses_categories_m
 * @property      Expenses_suppliers_m          $expenses_suppliers_m
 * @property      Paypal_lib                    $paypal_lib
 * @property      Project_template_m            $project_template_m
 * @property      Notification_m                $notification_m
 * @property      CI_Input                      $input
 * @property      Kitchen_comment_m             $kitchen_comment_m
 * @property      Ticket_statuses_m             $ticket_statuses_m
 * @property      Client_support_rates_matrix_m $client_support_rates_matrix_m
 * @property      Email_settings_templates      $email_settings_templates
 * @property      Plugins_m                     $plugins_m
 */
abstract class Plugin {
    /**
     * Holds attribute data
     */
    private $attributes = array();

    /**
     * Holds content between tags
     */
    private $content = array();

    /**
     * Version of the plugin.
     */
    public $version = '1.0.0';

    /**
     * Author of the plugin to be displayed in the admin panel.
     */
    public $author = 'Unknown';

    /**
     * URL for the plugin to be displayed in the admin panel.
     */
    public $url = '';

    /**
     * Identifier for referencing Plugin.
     */
    public $alias = null;

    /**
     * The name of the plugin that will be displayed.
     */
    public $name = array(
        'en' => null,
    );

    /**
     * The description of the plugin that will be displayed.
     */
    public $description = array(
        'en' => "<p>No description provided.</p>",
    );

    /**
     * Array of config settings.
     */
    public $config = array(
        'fields' => array(),
    );

    function __construct() {
        if ($this->alias === null) {
            $alias = substr(__CLASS__, 0, strlen("Plugin_"));
            $this->alias = strtolower($alias);
            $this->name['en'] = humanize($alias);
        }
    }

    /**
     * Set Data for the plugin.
     * Avoid doing this in constructor so we do not force logic on developers.
     *
     * @param array $content    Content of the tags if any
     * @param array $attributes Attributes passed to the plugin
     */
    public function set_data($content, $attributes) {
        $content AND $this->content = $content;

        if ($attributes) {
            // Let's get parse_params first since it
            // dictates how we handle all tags
            if (!isset($attributes['parse_params']))
                $attributes['parse_params'] = true;

            if (str_to_bool($attributes['parse_params'])) {
                // For each attribute, let's see if we need to parse it.
                foreach ($attributes as $key => $attr) {
                    $attributes[$key] = $this->parse_parameter($attr);
                }
            }

            $this->attributes = $attributes;
        }
    }

    /**
     * Make the Codeigniter object properties & methods accessible to this class.
     *
     * @param string $var The name of the method/property.
     *
     * @return mixed
     */
    public function __get($var) {
        if (isset(get_instance()->$var)) {
            return get_instance()->$var;
        }
    }

    /**
     * Getter for the content.
     *
     * @return string
     */
    public function content() {
        return $this->content;
    }

    /**
     * Getter for the attributes.
     *
     * @return array
     */
    public function attributes() {
        return $this->attributes;
    }

    /**
     * Get the value of an attribute.
     *
     * @param string $param   The name of the attribute.
     * @param mixed  $default The default value to return if no value can be found.
     *
     * @return mixed The value.
     */
    public function attribute($param, $default = null) {
        return isset($this->attributes[$param]) ? $this->attributes[$param] : $default;
    }

    /**
     * Set the value of an attribute.
     *
     * @param string $param The name of the attribute.
     * @param mixed  $value The value to set for the attribute.
     *
     * @return mixed The value.
     */
    public function set_attribute($param, $value) {
        $this->attributes[$param] = $value;
    }

    /**
     * Return settings from the Pancake settings store.
     *
     * @param string $name The name of the setting to read.
     */
    public function settings($name) {
        return Settings::get($name);
    }

    /**
     * Parse special variables in an attribute
     *
     * @param string $value The value of the attribute.
     * @param array  $data  Additional data to parse with
     *
     * @return string The value.
     */
    public function parse_parameter($value, $data = array()) {
        // Parse for variables. Before we do anything crazy,
        // let's check for a bracket.
        if (strpos($value, '[[') !== false) {
            // Change our [[ ]] to {{ }}. Sneaky.
            $value = str_replace(array('[[', ']]'), array('{{', '}}'), $value);

            $default_data = array(
                'segment_1' => $this->uri->segment(1),
                'segment_2' => $this->uri->segment(2),
                'segment_3' => $this->uri->segment(3),
                'segment_4' => $this->uri->segment(4),
                'segment_5' => $this->uri->segment(5),
                'segment_6' => $this->uri->segment(6),
                'segment_7' => $this->uri->segment(7),
            );

            // user info
            if ($this->current_user) {
                $default_data['user_id'] = $this->current_user->id;
                $default_data['username'] = $this->current_user->username;
            }

            return $this->parser->parse_string($value, array_merge($default_data, $data), true);
        }

        return $value;
    }

    public function get($name) {
        return Plugins::get($this->alias . ":" . $name);
    }

    public function set($name, $value) {
        return Plugins::set($this->alias . ":" . $name, $value);
    }

    public function set_frontend_css($string) {
        return $this->set("frontend.css", $string);
    }

    public function set_frontend_js($string) {
        return $this->set("frontend.js", $string);
    }

    public function set_backend_css($string) {
        return $this->set("backend.css", $string);
    }

    public function set_backend_js($string) {
        return $this->set("backend.js", $string);
    }

    public function get_frontend_css($string) {
        return $this->get("frontend.css", $string);
    }

    public function get_frontend_js($string) {
        return $this->get("frontend.js", $string);
    }

    public function get_backend_css($string) {
        return $this->get("backend.css", $string);
    }

    public function get_backend_js($string) {
        return $this->get("backend.js", $string);
    }

    /**
     * Creates a database table.
     *
     * @param $table
     */
    function create_table($table) {
        call_user_func_array(__FUNCTION__, func_get_args());
    }

    /**
     * Drops a database table.
     *
     * @param $table
     */
    function drop_table($table) {
        call_user_func_array(__FUNCTION__, func_get_args());
    }

    /**
     * Creates a field in $table and a relationship to $rel_table.$rel_field.
     * By default the field is called "id" and the type is "unsigned integer(11)".
     * By default, on updating a record in $rel_table it cascades to $table and on delete it restricts.
     *
     * @param string $table
     * @param string $field
     * @param string $rel_table
     * @param string $rel_field
     * @param string $type
     * @param int    $constraint
     * @param string $on_update
     * @param string $on_delete
     */
    function add_relationship_column($table, $field, $rel_table, $rel_field = "id", $type = "unsigned_int", $constraint = 11, $on_update = "cascade", $on_delete = "restrict") {
        call_user_func_array(__FUNCTION__, func_get_args());
    }

    /**
     * Drops a column that has a relationship.
     *
     * @param string $table
     * @param string $field
     */
    function drop_relationship_column($table, $field) {
        call_user_func_array(__FUNCTION__, func_get_args());
    }

    /**
     * Adds a column to a database table only if that column does not already exist.
     *
     * @param string  $table
     * @param string  $name
     * @param string  $type
     * @param mixed   $constraint
     * @param mixed   $default
     * @param boolean $null
     * @param string  $after_field
     *
     * @return boolean
     */
    function add_column($table, $name, $type, $constraint = null, $default = '', $null = false, $after_field = '', $on_after_create = null) {
        call_user_func_array(__FUNCTION__, func_get_args());
    }

    /**
     * Drops a table's column.
     *
     * @param string $table
     * @param string $name
     *
     * @return mixed
     */
    function drop_column($table, $name) {
        call_user_func_array(__FUNCTION__, func_get_args());
    }
}

class Plugins {
    private $loaded = array();

    /**
     * @var    Pancake_Controller    The CI global object
     */
    private $_ci;
    /**
     * @var    array    Holds the settings from the db
     */
    private static $_settings = array();

    public function __construct() {
        $this->_ci = &get_instance();

        $this->_ci->load->helper('plugin');

        $this->_ci->config->load('plugins');

        $this->_ci->load->model('plugins/plugins_m');

        $this->reload();
    }

    /**
     * This allows you to get the settings like this, which is ideal for
     * use in views:
     * Plugins::get('setting_name');
     *
     * @static
     * @access    public
     *
     * @param    string    The name of the setting
     *
     * @return    string    The setting value
     */
    public static function get($name) {
        if (substr($name, -strlen("_installed")) === "_installed") {
            $name = str_ireplace("_installed", ":installed", $name);
        }

        if (stristr($name, ":") === false) {
            $backtrace = debug_backtrace();
            $plugin_alias = null;

            if (isset($backtrace[1]['class']) && substr($backtrace[1]['class'], 0, strlen("Plugin_")) == "Plugin_") {
                $plugin_alias = $backtrace[1]['object']->alias;
            }

            if ($plugin_alias === null) {
                return false;
            } else {
                $key = $name;
                if (stristr($key, $plugin_alias) !== false) {
                    $key = substr($key, strlen($plugin_alias) + 1); # +1 to get rid of the underscore that separated the alias and the key
                }

                if (isset(self::$_settings["$plugin_alias:$key"])) {
                    return self::$_settings["$plugin_alias:$key"];
                } elseif (isset(self::$_settings["$plugin_alias:{$plugin_alias}_{$key}"])) {
                    return self::$_settings["$plugin_alias:{$plugin_alias}_{$key}"];
                } elseif (isset(self::$_settings["{$plugin_alias}_{$key}"])) {
                    return self::$_settings["{$plugin_alias}_{$key}"];
                } elseif (isset(self::$_settings[$key])) {
                    return self::$_settings[$key];
                } else {
                    return false;
                }
            }
        } else {
            if (!isset(self::$_settings[$name])) {
                return false;
            } else {
                return is_string(self::$_settings[$name]) ? trim(self::$_settings[$name]) : self::$_settings[$name];
            }
        }
    }

    public static function get_aliased($plugin_alias, $key) {
        if (Plugins::exists("$plugin_alias:$key")) {
            return Plugins::get("$plugin_alias:$key");
        } elseif (Plugins::exists("$plugin_alias:{$plugin_alias}_{$key}")) {
            return Plugins::get("$plugin_alias:{$plugin_alias}_{$key}");
        } elseif (Plugins::exists("{$plugin_alias}_{$key}")) {
            return Plugins::get("{$plugin_alias}_{$key}");
        } else {
            return Plugins::get("$key");
        }
    }

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
        return Plugins::get($name);
    }

    /**
     * This allows you to store settings in a key/value pattern.
     *
     * @param string $name  The key of the value to store.
     * @param mixed  $value The value to store.
     */
    public static function set($name, $value) {

        if (substr($name, -strlen("_installed")) === "_installed") {
            # This is no longer supported, but is used by old plugins.
            # So we're replacing it with a no-op to avoid problems.
            return;
        }

        if (stristr($name, ":") === false) {
            $backtrace = debug_backtrace();
            $plugin_alias = null;

            if (isset($backtrace[1]['class']) && substr($backtrace[1]['class'], 0, strlen("Plugin_")) == "Plugin_") {
                $plugin_alias = $backtrace[1]['object']->alias;
            }

            if ($plugin_alias !== null) {
                $key = substr($name, strlen($plugin_alias) + 1); # +1 to get rid of the underscore that separated the alias and the key
                $name = "$plugin_alias:$key";
            }
        } else {
            $plugin_alias = array_reset(explode(":", $name));
        }

        $CI = get_instance();

        $value = is_array($value) ? json_encode($value) : $value;

        if (Plugins::get($name) !== false) {
            $CI->db->where('slug', $name)->update('plugins', array('value' => $value));
            $CI->plugins->reload();
        } else {
            if ($CI->db->where('slug', $name)->count_all_results('plugins') == 0) {
                $result = $CI->db->insert('plugins', array('slug' => $name, 'value' => $value));
                $CI->plugins->reload();
                return $result;
            } else {
                return true;
            }
        }
    }

    public function __set($name, $value) {
        self::set($name, $value);
    }

    public static function exists($name) {
        return isset(self::$_settings[$name]);
    }

    /**
     * Delete an entry fromt he plugin key/value store.
     *
     * @param string $name The key of the value to store.
     */
    public static function delete($name) {
        $CI = &get_instance();
        $result = $CI->db->where('slug', $name)->delete('plugins');
        $CI->plugins->reload();
        return $result;
    }

    /**
     * Load all plugins that are present in the plugins directory.
     */
    public function load_all() {
        $plugins = $this->_ci->plugins_m->get_all_present();

        if (isset($plugins['.'])) {
            show_error("You've got a plugin.php file in /third_party/modules. Plugins should be in a folder of their own (e.g. /third_party/modules/my_plugin/plugin.php).");
        }

        foreach ($plugins as $plugin => $path) {
            $this->_process($path, $plugin, 'register_events', array(), "");
        }
    }

    public function locate($plugin, $attributes, $content) {
        if (strpos($plugin, ':') === false) {
            return false;
        }
        // Setup our paths from the data array
        list($class, $method) = explode(':', $plugin);

        $directories = $this->_ci->config->item('plugin_directories');

        foreach ($directories as $directory) {
            if (file_exists($path = $directory . '/' . $class . '/plugin.php')) {
                return $this->_process($path, $class, $method, $attributes, $content);
            } else {
                if (defined('ADMIN_THEME') and file_exists($path = APPPATH . 'themes/' . ADMIN_THEME . '/plugins/' . $class . '.php')) {
                    return $this->_process($path, $class, $method, $attributes, $content);
                }
            }

            // Maybe it's a module
            if (module_exists($class)) {
                if (file_exists($path = $directory . 'modules/' . $class . '/plugin.php')) {
                    $dirname = dirname($path) . '/';

                    // Set the module as a package so I can load stuff
                    $this->_ci->load->add_package_path($dirname);

                    $response = $this->_process($path, $class, $method, $attributes, $content);

                    $this->_ci->load->remove_package_path($dirname);

                    return $response;
                }
            }
        }

        log_message('debug', 'Unable to load: ' . $class);

        return false;
    }

    /**
     * Process
     * Just process the class
     *
     * @todo Document this better.
     *
     * @param string $path
     * @param string $class
     * @param string $method
     * @param array  $attributes
     * @param array  $content
     *
     * @return bool|mixed
     */
    private function _process($path, $class, $method, $attributes, $content) {
        $class = strtolower($class);
        $class_name = 'Plugin_' . ucfirst($class);

        if (!isset($this->loaded[$class])) {
            include $path;
            $this->loaded[$class] = true;
        }

        if (!class_exists($class_name)) {
            log_message('error', 'Plugin class "' . $class_name . '" does not exist.');
            throw new Exception('Plugin "' . $class_name . '" does not exist.');
            return false;
        }

        $class_init = new $class_name;

        $installed = $class_init->get('installed') == 1;

        if (!$installed) {
            return false;
        } else {
        }

        $class_init->set_data($content, $attributes);

        if (!is_callable(array($class_init, $method))) {
            // But does a property exist by that name?
            if (property_exists($class_init, $method)) {
                return true;
            }

            if ($method == "register_events") {
                # No events to be registered, don't worry about it.
                return false;
            }

            throw new Exception('Method "' . $method . '" does not exist in plugin "' . $class_name . '".');

            return false;
        }

        $installed_md5 = $class_init->get("installed_md5");
        $new_md5 = md5_file($path);
        if ($installed_md5 !== $new_md5) {
            if (is_callable(array($class_init, "install"))) {
                call_user_func(array($class_init, "install"));
            }
            $class_init->set("installed_md5", $new_md5);
        }

        return call_user_func(array($class_init, $method));
    }

    /**
     * This reloads the settings in from the database.
     *
     * @access    public
     * @return    void
     */
    public function reload() {
        Plugins::$_settings = array();

        foreach ($this->_ci->plugins_m->get_all() as $setting) {
            $value = $setting->value;
            if (is_array(json_decode($setting->value, true))) {
                $value = decrypt($setting->value);
                if (is_array(json_decode($value, true))) {
                    $value = json_decode($value, true);
                }
            } else {
                $value = $setting->value;
            }

            Plugins::$_settings[$setting->slug] = $value;
        }


    }
}
