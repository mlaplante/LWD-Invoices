<?php

defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2013, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 4.0
 */
// ------------------------------------------------------------------------

/**
 * The admin controller for store
 *
 * @subpackage	Controllers
 * @category	Store
 */
class Admin extends Admin_Controller {

    function __construct() {
        parent::__construct();
        $this->load->model('store_m');
    }

    public function index($offset = 0, $term = '') {
        if (isset($_POST['term']) and !empty($_POST['term'])) {
            $term = $_POST['term'];
        } else {
            $term = base64_decode($term);
        }

        $this->template->term = $term;
        $this->template->plugins_store_results = $this->store_m->get_plugins(PHP_INT_MAX, $offset, $term);
        $this->template->build('store/index');
    }

    function complete($unique_id = '', $token = '', $email = '') {
        # Disabled temporarily because /buy_plugin isn't up in pancakeapp.com.
        # Settings::set("store_auth_token", $token);
        # Settings::set("store_auth_email", $email);

        $plugin = $this->store_m->complete_payment($unique_id);

        if ($plugin !== false) {
            $this->session->set_flashdata('success', __('store:installed_successfully', array(
                $plugin['title'],
                strtolower($plugin['type'])
            )));

            if ($plugin['type_id'] == STORE_TYPE_PLUGIN) {
                redirect('admin/plugins');
            } elseif ($plugin['type_id'] == STORE_TYPE_BACKEND_THEME or $plugin['type_id'] == STORE_TYPE_FRONTEND_THEME) {
                redirect('admin/settings');
            } elseif ($plugin['type_id'] == STORE_TYPE_GATEWAY) {
                redirect('admin/settings#payment');
            }
        } else {
            // No idea why this'd ever show up, but we've got the "please contact" there so we can learn more about the error if/when it does happen.
            show_error("An unexpected error occurred while trying to install your purchased item. Please contact support@pancakeapp.com.");
        }
    }

    function view($unique_id) {
        $plugin = $this->store_m->get_single($unique_id);

        if (empty($plugin)) {
            show_404();
        }

        $this->template->plugin = $plugin;
        $this->template->build('store/view');
    }

    function buy($unique_id) {
        if (IS_DEMO) {
            echo json_encode(array(
                'success' => false,
                'reason' => 'PANCAKE_DEMO'
            ));
        }

        if (!isset($_POST['password'])) {
            $_POST['password'] = '';
        }

        if (!isset($_POST['email'])) {
            $_POST['email'] = '';
        }

        $result = $this->store_m->buy($unique_id, $_POST['email'], $_POST['password']);

        if ($result === true) {
            $plugin = $this->store_m->get_single($unique_id);

            $this->session->set_flashdata('success', __('store:installed_successfully', array(
                $plugin['title'],
                strtolower($plugin['type'])
            )));

            if ($plugin['type_id'] == STORE_TYPE_PLUGIN) {
                $new_url = site_url('admin/plugins');
            } elseif ($plugin['type_id'] == STORE_TYPE_BACKEND_THEME or $plugin['type_id'] == STORE_TYPE_FRONTEND_THEME) {
                $new_url = site_url('admin/settings');
            } elseif ($plugin['type_id'] == STORE_TYPE_GATEWAY) {
                $new_url = site_url('admin/settings#payment');
            }
        } elseif ($result == STORE_INVALID_AUTH) {
            $new_url = $this->store_m->pancake_base . "account/authorize/".Settings::get('license_key')."/$unique_id?return_to=" . site_url('admin/store/complete/' . $unique_id);
        } else {
            $new_url = '';
        }

        echo json_encode(array(
            'success' => $result === true,
            'new_url' => $new_url,
            'result_modal' => $result == STORE_ALREADY_PURCHASED ? 'already-purchased' : '',
            'redirect_to_pancake' => $result == STORE_INVALID_AUTH,
            'reason' => __('store:error' . $result),
        ));
    }

    function update() {
        $result = $this->store_m->install_or_update();
        echo $result === true ? "UPDATED" : "FAIL: ERROR $result";
    }

}