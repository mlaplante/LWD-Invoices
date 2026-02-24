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
class Ticket_priorities_m extends Pancake_Model {

    protected $table = 'ticket_priorities';

    function getDropdown() {
        $buffer = $this->get_all();

        $return = array();

        foreach ($buffer as $row) {
            $title = $row->title;
            if ($row->default_rate) {
                $title = "$title - " . Currency::format($row->default_rate);
            }
            $return[$row->id] = $title;
        }

        return $return;
    }

}
