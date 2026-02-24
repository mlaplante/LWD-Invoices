<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package             Pancake
 * @author              Pancake Dev Team
 * @copyright           Copyright (c) 2013, Pancake Payments
 * @license             http://pancakeapp.com/license
 * @link                http://pancakeapp.com
 * @since               Version 4.0
 */
// ------------------------------------------------------------------------

/**
 * The Store Model
 *
 * @subpackage    Models
 * @category      Store
 */
class Store_m extends Pancake_Model {

    public $base;
    public $pancake_base;
    public $http;
    public $purchases_cache;

    function __construct() {
        parent::__construct();

        $this->pancake_base = PANCAKEAPP_COM_BASE_URL;
        $this->base = MANAGE_PANCAKE_BASE_URL . "pages/";

        include_once APPPATH . 'libraries/HTTP_Request.php';
        $this->http = new HTTP_Request();

        $this->purchases_cache = array();
        $buffer = $this->db->get('store_purchases')->result_array();
        foreach ($buffer as $row) {
            $this->purchases_cache[$row['plugin_unique_id']] = $row;
        }
    }

    function get_plugins($per_page, $offset, $term = '') {
        $contents = $this->http->request($this->base . 'get_plugins/' . $per_page . "/" . $offset, 'POST', array(
            'term' => $term,
        ));
        $results = json_decode($contents, true);
        if ($results === null && json_last_error()) {
            throw_exception("Could not fetch a plugin's details: " . $contents);
        }

        if (!$results) {
            $results = [];
        }

        foreach ($results as &$row) {
            $row['button'] = $this->get_buy_button($row['unique_id'], number_format($row['price'], 2));
        }

        return $results;
    }

    function get_single($unique_id) {
        $contents = $this->http->request($this->base . 'get_single_plugin/' . $unique_id);
        $result = json_decode($contents, true);
        if ($result === null && json_last_error()) {
            throw_exception("Could not fetch a plugin's details: " . $contents);
        }
        if (!empty($result)) {
            $result['button'] = $this->get_buy_button($result['unique_id'], number_format($result['price'], 2));
        }
        return $result;
    }

    function screenshot($filename) {
        return $this->base . "screenshot/" . $filename;
    }

    function get_buy_button($unique_id, $price = '') {

        $license_key = Settings::get('license_key');
        # Disabled temporarily because /buy_plugin isn't up in pancakeapp.com.
        # $payment_token = Settings::get('store_auth_token');
        $payment_token = "";
        $has_payment_token = empty($payment_token) ? false : true;
        $already_purchased = isset($this->purchases_cache[$unique_id]);

        if ($already_purchased) {

            if (!empty($this->purchases_cache[$unique_id]['filepath'])) {
                $is_installed = file_exists(FCPATH . $this->purchases_cache[$unique_id]['filepath']);
            } else {
                $is_installed = false;
            }
            $out_of_date = $this->purchases_cache[$unique_id]['current_version'] != $this->purchases_cache[$unique_id]['latest_version'];
            $type_id = $this->purchases_cache[$unique_id]['plugin_type_id'];

            if ($is_installed) {
                if ($out_of_date) {
                    return array(
                        'href' => site_url('admin/settings#update'),
                        'text' => __("store:update"),
                    );
                } else {
                    if ($type_id == STORE_TYPE_PLUGIN) {
                        $href = site_url('admin/plugins#_' . pathinfo($this->purchases_cache[$unique_id]['filepath'], PATHINFO_FILENAME));
                    } elseif ($type_id == STORE_TYPE_BACKEND_THEME or $type_id == STORE_TYPE_FRONTEND_THEME) {
                        $href = site_url('admin/settings');
                    } elseif ($type_id == STORE_TYPE_GATEWAY) {
                        $href = site_url('admin/settings#payment');
                    }

                    return array(
                        'href' => $href,
                        'text' => __("store:settings"),
                    );
                }
            } else {
                return array(
                    'class' => 'install-with-modal',
                    'href' => site_url('admin/store/update'),
                    'text' => __("store:install"),
                    'data-reveal-id' => "install-with-modal",
                );
            }
        } elseif ($has_payment_token) {
            if ($price > 0) {
                return array(
                    'class' => 'buy-with-modal plugin-' . $unique_id,
                    'href' => site_url("admin/store/buy/" . $unique_id),
                    'text' => __("store:buy", array($price)),
                    'data-reveal-id' => "buy-with-modal",
                );
            } else {
                return array(
                    'class' => 'download-free',
                    'href' => site_url("admin/store/buy/" . $unique_id),
                    'text' => __("store:download_free"),
                );
            }
        } else {
            if ($price > 0) {

                // Send to pancakeapp.com/account to create authorization.
                return array(
                    'href' => $this->pancake_base . "account/authorize/$license_key/$unique_id?return_to=" . site_url('admin/store/complete/' . $unique_id),
                    'text' => __("store:buy", array($price)),
                );

            } else {
                return array(
                    'class' => 'download-free',
                    'href' => site_url("admin/store/buy/" . $unique_id),
                    'text' => __("store:download_free"),
                );
            }
        }
    }

    function complete_payment($unique_id, $plugin = null) {
        if ($plugin === null) {
            $plugin = $this->get_single($unique_id);
        }

        $this->db->where('plugin_unique_id', $unique_id)->delete('store_purchases');

        $this->db->insert('store_purchases', array(
            'plugin_unique_id' => $unique_id,
            'plugin_title' => $plugin['title'],
            'plugin_type_id' => $plugin['type_id'],
            'latest_version' => $plugin['version'],
            'changelog_since_current_version' => '',
            'filepath' => '',
        ));

        $installed = $this->install_or_update();
        return $installed ? $plugin : false;
    }

    function get_installed_plugins() {
        $buffer = $this->db->select('plugin_unique_id, current_version')->get('store_purchases')->result_array();
        $installed_plugins = array();
        foreach ($buffer as $row) {
            if (isset($this->purchases_cache[$row['plugin_unique_id']])) {
                $is_installed = file_exists(FCPATH . $this->purchases_cache[$row['plugin_unique_id']]['filepath']);
                if ($is_installed) {
                    $installed_plugins[$row['plugin_unique_id']] = $row['current_version'];
                }
            }
        }
        return $installed_plugins;
    }

    function get_outdated_details() {
        $outdated_buffer = $this->db->where('current_version != latest_version', null, false)->get('store_purchases')->result_array();
        $return = array();

        foreach ($outdated_buffer as $row) {
            switch ($row['plugin_type_id']) {
                case STORE_TYPE_PLUGIN:
                    $row['type'] = __('store:plugin');
                    break;
                case STORE_TYPE_BACKEND_THEME:
                    $row['type'] = __('store:backend_theme');
                    break;
                case STORE_TYPE_FRONTEND_THEME:
                    $row['type'] = __('store:frontend_theme');
                    break;
                case STORE_TYPE_GATEWAY:
                    $row['type'] = __('store:payment_gateway');
                    break;
                default:
                    $row['type'] = __('store:unknown');
                    break;
            }

            $row['changelog_since_current_version'] = json_decode($row['changelog_since_current_version'], true);

            $return[$row['plugin_unique_id']] = $row;
        }

        return $return;
    }

    function check_for_updates() {
        dd('here');
        $url = $this->base . "check_for_plugin_updates/" . Settings::get('license_key');
        $original_contents = $this->http->request($url, "POST", array(
            'installed_plugins' => json_encode($this->get_installed_plugins()),
        ));

        $contents = json_decode($original_contents, true);
        if ($contents === null) {
            log_message('error', "A problem occurred while requesting $url (invalid JSON). The request returned:\n\n\n$original_contents");
            return STORE_TEMPORARY_ERROR;
        }

        foreach ($contents as $unique_id => $details) {
            if ($this->db->where('plugin_unique_id', $unique_id)->count_all_results('store_purchases') == 0) {
                $this->db->insert('store_purchases', array(
                    'plugin_unique_id' => $unique_id,
                    'plugin_title' => $details['title'],
                    'plugin_type_id' => $details['type'],
                    'latest_version' => $details['version'],
                    'changelog_since_current_version' => json_encode($details['changelog']),
                    'current_version' => '',
                    'filepath' => '',
                ));
            } else {
                $this->db->where('plugin_unique_id', $unique_id)->update('store_purchases', array(
                    'latest_version' => $details['version'],
                    'changelog_since_current_version' => json_encode($details['changelog']),
                ));
            }
        }
    }

    function install_or_update() {

        $url = $this->base . "download_plugins/" . Settings::get('license_key');
        $original_contents = $this->http->request($url, "POST", array(
            'installed_plugins' => json_encode(array()),
        ));

        $contents = json_decode($original_contents, true);
        if ($contents === null) {
            throw_exception("A problem occurred while requesting $url (invalid JSON).", $original_contents);
        }

        $CI = get_instance();
        $CI->load->model('upgrade/update_system_m', 'update');
        if (!$CI->update->write and !$CI->update->ftp) {
            return STORE_NO_WRITE_PERMISSIONS;
        }

        # Empty store_purchases prior to replacing the updates.
        # This avoids a bug where if a record exists in store_purchases,
        # but a purchase was voided or otherwise didn't go through,
        # the system would show "Install" and never actually allow you to buy.
        $this->db->truncate("store_purchases");

        foreach ($contents as $unique_id => $details) {
            foreach ($details['suzip'] as $filename => $data) {
                $CI->update->set_file_contents($filename, base64_decode($data));
            }

            // Finished installing.

            if ($this->db->where('plugin_unique_id', $unique_id)->count_all_results('store_purchases') == 0) {
                $this->db->insert('store_purchases', array(
                    'plugin_unique_id' => $unique_id,
                    'plugin_title' => $details['title'],
                    'plugin_type_id' => $details['type'],
                    'latest_version' => $details['version'],
                    'filepath' => $details['filepath'],
                    'current_version' => $details['version'],
                    'changelog_since_current_version' => '',
                ));
            } else {
                $this->db->where('plugin_unique_id', $unique_id)->update('store_purchases', array(
                    'filepath' => $details['filepath'],
                    'current_version' => $details['version'],
                ));
            }
        }

        return true;
    }

    function buy($unique_id, $email, $password) {
        # Disabled temporarily because /buy_plugin isn't up in pancakeapp.com.
        # $payment_token = Settings::get('store_auth_token');
        $payment_token = "";
        $already_purchased = isset($this->purchases_cache[$unique_id]);

        if ($already_purchased) {
            return STORE_ALREADY_PURCHASED;
        } else {
            $result = $this->http->request($this->pancake_base . "buy_plugin", "POST", array(
                'unique_id' => $unique_id,
                'user_email' => $email,
                'user_password' => $password,
                'license_key' => Settings::get('license_key'),
                'token' => $payment_token,
            ));

            $result = json_decode($result, true);

            if ($result === null) {
                return STORE_TEMPORARY_ERROR;
            }

            if ($result['status'] == 'fail') {
                if ($result['reason'] == STORE_INVALID_AUTH) {
                    // Throw away the token so they can auth again.
                    Settings::set('store_auth_email', '');
                    Settings::set('store_auth_token', '');
                }

                return $result['reason'];
            } else {
                // Bought successfully!
                $this->complete_payment($unique_id, $result['plugin']);
                return true;
            }
        }
    }

}