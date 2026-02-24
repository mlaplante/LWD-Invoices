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
 * The Plugins Model
 *
 * @subpackage    Models
 * @category      Plugins
 */
class Plugins_m extends Pancake_Model {
    /**
     * @var string    The name of the settings table
     */
    protected $table = 'plugins';

    /**
     * @var string    The primary key
     */
    public $primary_key = 'slug';

    /**
     * @var bool    Tells the model to skip auto validation
     */
    protected $skip_validation = true;

    protected $enabled_plugins = null;

    /**
     * Return stored values for plugins.
     *
     * @param string $key Associative key by which to retreive settings.
     */
    public function get_plugin_setting($plugin_alias, $key) {
        return Plugins::get_aliased($plugin_alias, $key);
    }

    /**
     * Key/Value store for plugin settings.
     *
     * @param string $key   Associative key by which to retreive settings.
     * @param mixed  $value Value to store.
     */
    public function set_plugin_setting($plugin_alias, $key, $value) {
        return Plugins::set("$plugin_alias:$key", $value);
    }

    /**
     * Return a list of all found plugins.
     */
    public function get_all_present() {
        $directories = $this->config->item('plugin_directories');

        $plug_ins = array();

        foreach ($directories as $directory) {
            if (is_dir($directory)) {
                $plugins = scandir($directory);

                foreach ($plugins as $k => $plugin) {
                    $plugin_dir = $directory . $plugin;

                    $path = $plugin_dir . '/plugin.php';

                    if (is_dir($plugin_dir) && file_exists($path)) {
                        $plug_ins[$plugin] = $path;
                    }
                }
            }
        }

        return $plug_ins;
    }

    public function get_all_enabled() {
        if ($this->enabled_plugins === null) {
            $this->enabled_plugins = [];
            $enabled = $this->db->like("slug", ":installed", "before")->get("plugins")->result_array();
            foreach ($enabled as $item) {
                $plugin = array_reset(explode(":", $item['slug']));
                $value = decrypt($item['value']);

                if ($value) {
                    $this->enabled_plugins[] = $plugin;
                }
            }
        }

        return $this->enabled_plugins;
    }

    public function get_all_with_details() {
        $plugins = $this->get_all_present();

        $plugin_details = array();

        foreach ($plugins as $plugin => $path) {
            $class_name = $class_name = 'Plugin_' . ucfirst($plugin);
            if (class_exists($class_name)) {
                $plugin_details[$plugin] = new stdClass;

                $instance = new $class_name;

                $plugin_details[$plugin]->author = property_exists($instance, 'author') ? $instance->author : 'undefined';

                $plugin_details[$plugin]->url = property_exists($instance, 'url') ? $instance->url : 'undefined';

                $plugin_details[$plugin]->alias = property_exists($instance, 'alias') ? $instance->alias : 'undefined';

                $plugin_details[$plugin]->installed = $this->get_plugin_setting($plugin_details[$plugin]->alias, 'installed');

                $plugin_details[$plugin]->name = property_exists($instance, 'name') ? $instance->name['en'] : 'undefined';

                if (property_exists($instance, 'description')) {
                    $plugin_details[$plugin]->description = is_array($instance->description) ? $instance->description['en'] : $instance->description;
                } else {
                    $plugin_details[$plugin]->description = "";
                }

                $plugin_details[$plugin]->fields = property_exists($instance, 'config') ? $instance->config['fields'] : array();

                if (count($plugin_details[$plugin]->fields) < 1) {
                    continue;
                }

                $alias = $plugin_details[$plugin]->alias;
                $new_fields = array();

                foreach ($plugin_details[$plugin]->fields as $key => $field) {
                    if (substr($key, 0, strlen($alias)) == $alias) {
                        $key = substr($key, strlen($alias) + 1); # +1 to get rid of the underscore that separated the alias and the key
                    }

                    $val = $this->get_plugin_setting($alias, $key);
                    $field['value'] = isset($val) ? $val : $field['default'];

                    $new_fields[$key] = $field;
                }

                $plugin_details[$plugin]->fields = $new_fields;
            }
        }

        return $plugin_details;
    }

    private function _get_plugin_details() {

    }
}