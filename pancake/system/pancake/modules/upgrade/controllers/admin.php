<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package          Pancake
 * @author           Pancake Dev Team
 * @copyright        Copyright (c) 2011, Pancake Payments
 * @license          http://pancakeapp.com/license
 * @link             http://pancakeapp.com
 * @since            Version 3.1.0
 */
// ------------------------------------------------------------------------

/**
 * The admin controller for the upgrade system
 *
 * @subpackage    Controllers
 * @category      Upgrade
 */
class Admin extends Admin_Controller {

    /**
     * Update_system_m
     *
     * @var Update_system_m
     */
    public $update;

    public function __construct() {
        parent::__construct();
    }

    function no_internet_access() {
        $original_url = base64_decode($this->uri->segment(2));
        $url = parse_url($original_url);

        unset($this->template->_partials['notifications']);
        unset($this->template->_partials['search']);
        switch_theme(false);
        $this->template->set_layout("login");
        $this->template->title(__('update:nointernetaccess'));
        $this->template->build('no_internet_access', array('url' => $url['host'], 'full_url' => $original_url));
    }

    function update() {
        if (function_exists("set_time_limit") && @ini_get("safe_mode") == 0) {
            @set_time_limit(0);
        }

        $this->load->model('upgrade/update_system_m', 'update');
        if ($this->update->write or $this->update->ftp) {
            $this->update->update_pancake();
            echo "UPDATED";
        } else {
            redirect('admin/settings#update');
        }
    }

    function update_if_no_conflicts() {
        if (function_exists("set_time_limit") && @ini_get("safe_mode") == 0) {
            @set_time_limit(0);
        }

        $this->load->model('upgrade/update_system_m', 'update');
        if ($this->update->write or $this->update->ftp) {
            if (count($this->update->check_for_conflicts()) == 0) {
                # There are no conflicts, upgrade.
                return $this->update();
            } else {
                redirect('admin/settings#update');
            }
        } else {
            redirect('admin/settings#update');
        }
    }

}