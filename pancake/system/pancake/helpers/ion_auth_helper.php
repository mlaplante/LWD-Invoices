<?php

defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Checks if the user is logged in
 *
 * @access	public
 * @return	bool	Login status
 */
function logged_in() {
    static $ci;
    isset($ci) OR $ci = & get_instance();

    if (!isset($ci->ion_auth)) {
        return false;
    }

    return isset($ci->current_user->id);
}

// ------------------------------------------------------------------------

/**
 * Checks if the user is an admin
 *
 * @access	public
 * @return	bool	Admin status
 */
function is_admin() {
    static $ci;
    isset($ci) OR $ci = & get_instance();

    if (!isset($ci->ion_auth)) {
        return false;
    }

    return $ci->ion_auth->is_admin();
}

// ------------------------------------------------------------------------

/**
 * Checks if the user is a member of a certain group
 *
 * @access	public
 * @param	string	The group name
 * @return	bool	Group membership status
 */
function is_group($group_name) {
    static $ci;
    isset($ci) OR $ci = & get_instance();

    if (!isset($ci->ion_auth)) {
        return false;
    }

    return $ci->ion_auth->is_group($group_name);
}
