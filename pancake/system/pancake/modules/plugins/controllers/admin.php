<?php

defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author        Pancake Dev Team
 * @copyright    Copyright (c) 2010, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link        http://pancakeapp.com
 * @since        Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * The admin controller for plugins
 *
 * @subpackage    Controllers
 * @category    Plugins
 */
class Admin extends Admin_Controller {

    public function index() {
        $this->config->load('plugins');

        $this->load->model('plugins_m');

        $this->template->plugins = $this->plugins_m->get_all_with_details();

        $this->template->build('plugins/index');
    }

    public function save() {
        $input = $this->input->post();

        $notice = 'Plugin Settings Saved';

        if (isset($input['name'])) {

            // Using $k as was previously done is NOT the right way, 
            // because if a checkbox isn't checked, the browser won't send it at all.
            // This leads to not being able to enable the second plugin unless you've also
            // enabled the first plugin.
            foreach ($input['name'] as $plugin) {
                if (isset($input['cb'][$plugin])) {
                    $this->plugins_m->set_plugin_setting($plugin, 'installed', true);
                } else {
                    $this->plugins_m->set_plugin_setting($plugin, 'installed', false);
                }
            }
        }

        if (isset($input['field'])) {
            foreach ($input['field'] as $plugin_alias => $fields) {
                foreach ($fields as $k => $val) {
                    $this->plugins_m->set_plugin_setting($plugin_alias, $k, $val);
                }
            }
        }

        $this->session->set_flashdata('success', $notice);

        redirect('admin/plugins');
    }

}