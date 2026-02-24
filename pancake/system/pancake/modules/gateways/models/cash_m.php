<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2010, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 2.2.0
 */
// ------------------------------------------------------------------------

/**
 * The Cash Gateway
 *
 * @subpackage	Gateway
 * @category	Payments
 */
class Cash_m extends Gateway {
    
    public $version = '1.0';
    public $has_payment_page = false;
    
    function __construct() {
        parent::__construct(__CLASS__);
        $this->title = lang('cash:cash');
        $this->notes = __('gateways:just_for_logging', array($this->title));
    }

}