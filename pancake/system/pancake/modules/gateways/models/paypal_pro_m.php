<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package             Pancake
 * @author              Pancake Dev Team
 * @copyright           Copyright (c) 2010, Pancake Payments
 * @license             http://pancakeapp.com/license
 * @link                http://pancakeapp.com
 * @since               Version 3.2.6
 */
// ------------------------------------------------------------------------

/**
 * The PayPal Payments Pro Gateway
 *
 * @subpackage    Gateway
 * @category      Payments
 */
class Paypal_pro_m extends Gateway {

    public $requires_pci = true;

    function __construct() {
        parent::__construct(__CLASS__);
        $this->title          = __('paypalpro:paypalpro');
        $this->frontend_title = __('paypalpro:viacreditcard');

        if (!defined('GATEWAY_API_USERNAME')) {
            define('GATEWAY_API_USERNAME', $this->get_field('api_username'));
            define('GATEWAY_API_PASSWORD', $this->get_field('api_password'));
            define('GATEWAY_API_SIGNATURE', $this->get_field('api_signature'));
        }

        $this->fields = array(
            'api_username' => __('gateways:api_username'),
            'api_password' => __('gateways:api_password'),
            'api_signature' => __('gateways:api_signature')
        );

        $this->client_fields = array(
            'cc_type' => array(
                'type' => 'select',
                'options' => array('Visa' => 'Visa', 'MasterCard' => 'MasterCard', 'Discover' => 'Discover', 'Amex' => 'American Express'),
                'label' => __('gateways:cc_type')
            ),
            'cc_number' => array(
                'label' => __('gateways:cc_number')
            ),
            'cc_exp' => array(
                'type' => 'mmyyyy',
                'label' => __('gateways:cc_exp')
            ),
            'cc_code' => array(
                'label' => __('gateways:cc_code')
            ),
        );
    }

    public function generate_payment_form($unique_id, $item_name, $amount, $success, $cancel, $notify, $currency_code, $invoice_number) {
        $this->load->spark('codeigniter-payments/0.1.4/');

        # Let's round the amount.
        $amount = round($amount, 2);

        $email = $this->get_client_details($unique_id);
        $email = $email['email'];

        $cc_number = $this->get_client_field('cc_number');
        $cc_number = empty($cc_number) ? 'x' : $cc_number;

        $result = $this->payments->oneoff_payment('paypal_paymentspro', array(
                'ip_address' => $_SERVER['REMOTE_ADDR'],
                'cc_type' => $this->get_client_field('cc_type'),
                'cc_number' => $cc_number,
                'cc_exp' => $this->get_client_field('cc_exp'),
                'cc_code' => $this->get_client_field('cc_code'),
                'email' => $email,
                'amt' => $amount
            )
        );

        if ($result->status == 'Failure') {

            $errored = false;

            if (isset($result->details->gateway_response->L_LONGMESSAGE0)) {
                $msg = str_ireplace('This transaction cannot be processed.', '', $result->details->gateway_response->L_LONGMESSAGE0);
                $msg = trim($msg);
                $this->error($msg);
                $errored = true;
            }

            if (isset($result->details->gateway_response->L_LONGMESSAGE1)) {
                $msg = str_ireplace('This transaction cannot be processed.', '', $result->details->gateway_response->L_LONGMESSAGE1);
                $msg = trim($msg);
                $this->error($msg);
                $errored = true;
            }

            if (isset($result->details->gateway_response->L_LONGMESSAGE2)) {
                $msg = str_ireplace('This transaction cannot be processed.', '', $result->details->gateway_response->L_LONGMESSAGE2);
                $msg = trim($msg);
                $this->error($msg);
                $errored = true;
            }

            if (!$errored) {
                if (!empty($result->details)) {
                    $msg = $result->response_message . " (Error #" . $result->details->gateway_response->L_ERRORCODE0 . ")";
                } else {
                    $msg = $result->response_message . "<br />(No error was given.)";
                }
                $this->error($msg);
            }

            return false;
        } else {
            return array(
                'txn_id' => $result->details->gateway_response->TRANSACTIONID, // the gateway transaction ID
                'payment_gross' => $result->details->gateway_response->AMT, // the amount paid, rounded to 2 decimal places
                'transaction_fee' => 0, // the fee charged by the gateway, rounded to 2 decimal places
                'payment_date' => strtotime($result->details->gateway_response->TIMESTAMP), // a UNIX timestamp for the payment date
                'payment_status' => 'Completed', // One of: Completed/Pending/Refunded/Unpaid
                'item_name' => $item_name, // the item name (passed to the gateway in generate_payment_form())
                'is_paid' => true, // true or false, depending on whether payment was successful or not
            );
        }
    }

}