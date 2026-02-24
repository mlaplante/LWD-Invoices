<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2017, Pancake Payments
 * @license        https://www.pancakeapp.com/license
 * @link           https://www.pancakeapp.com
 * @since          Version 1.0
 */
// ------------------------------------------------------------------------

/**
 * Fixes CI3 compatibility with the new CI_URI.
 *
 * @subpackage    URI
 */
class Pancake_URI extends CI_URI {

    function __construct() {
        $config =& load_class('Config', 'core');
        parent::__construct($config);
    }

    function _fetch_uri_string() {
        return $this->uri_string();
    }

    function _reindex_segments() {
        // No-op in CI3.
    }

    function _remove_url_suffix() {
        // No-op in CI3.
    }

    function _explode_segments() {
        // No-op in CI3.
    }

}