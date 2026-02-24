<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2012, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 3.6
 */
// ------------------------------------------------------------------------

/**
 * The Project Task Statuses Model
 *
 * @subpackage	Models
 * @category	Projects
 */
class Ticket_statuses_m extends Pancake_Model {

    protected $table = 'ticket_statuses';

    function getDropdown() {
        $buffer = $this->get_all();
        $return = array();
        foreach ($buffer as $row) {
            $return[$row->id] = $row->title;
        }
        return $return;
    }
    
    function get($primary_value) {
        
        # Avoid error with empty statuses.
        $primary_value = $primary_value > 0 ? $primary_value : 1;
        
        return parent::get($primary_value);
    }

}