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
 * @since		Version 4.0.1
 */
// ------------------------------------------------------------------------

/**
 * The "Settings -> Emails" templates model
 *
 * @subpackage	Models
 * @category	Email Templates
 */
class Email_settings_templates extends CI_Model {
    
    function get($identifier = null, $field = null) {
        static $templates = null;
        
        if ($templates === null) {
            foreach($this->db->get('email_settings_templates')->result_array() as $row) {
                $templates[$row['identifier']] = $row;
            }
        }
        
        if ($identifier === null) {
            return $templates;
        } else {
            return $field === null ? $templates[$identifier] : $templates[$identifier][$field];
        }
    }
    
    function store($data) {
        foreach ($data as $identifier => $row) {
            $this->db->where('identifier', $identifier)->update('email_settings_templates', $row);
        }
    }
    
}
