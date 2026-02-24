<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package             Pancake
 * @author              Pancake Dev Team
 * @copyright           Copyright (c) 2015, Pancake Payments
 * @license             https://www.pancakeapp.com/license
 * @link                https://www.pancakeapp.com
 * @since               Version 4.8.48
 */

/**
 * The Direct Debit Gateway
 *
 * @subpackage    Gateway
 * @category      Payments
 */
class Direct_debit_m extends Gateway {

    public $version = '1.0';
    public $has_payment_page = false;

    function __construct() {
        parent::__construct(__CLASS__);
        $this->title = __('gateways:direct_debit');
        $this->notes = __('gateways:just_for_logging', array($this->title));
    }

}