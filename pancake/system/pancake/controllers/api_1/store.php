<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2015, Pancake Payments
 * @license        https://www.pancakeapp.com/license
 * @link           https://www.pancakeapp.com
 * @since          Version 4.8.44
 */

// ------------------------------------------------------------------------

/**
 * The Store API controller
 *
 * @subpackage    Controllers
 * @category      API
 */
class Store extends REST_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->model('store/store_m');
    }

    function installed_get($unique_id = null) {

        if (empty($unique_id)) {
            $unique_id = $this->get('plugin_id');
        }

        if (empty($unique_id)) {
            $err_msg = 'No Plugin ID was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $installed_plugins = $this->store_m->get_installed_plugins();

        if (isset($installed_plugins[$unique_id])) {
            $this->response(array(
                'status' => true,
                'message' => "Plugin {$unique_id} (version: {$installed_plugins[$unique_id]}) is installed.",
                'is_installed' => true,
                'installed_version' => $installed_plugins[$unique_id],
            ), 200);
        } else {
            $this->response(array(
                'status' => true,
                'message' => "Plugin {$unique_id} is not installed.",
                'is_installed' => false,
                'installed_version' => null,
            ), 200);
        }
    }

}