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
 * The Authorize.net Gateway
 *
 * @subpackage	Gateway
 * @category	Payments
 */
class Authorizenet_m extends Gateway {

    public $title = 'Authorize.net';
    public $frontend_title = 'Credit Card (via Authorize.net)';
    public $version = '1.0';
    public $autosubmit = true;
    public $api_key;
    public $transaction_key;

    public function __construct() {
        parent::__construct(__CLASS__);
        $this->fields = array(
            'api_key' => __('authorize:api_login_id'),
            'transaction_key' => __('authorize:transaction_key'),
            'md5_hash' => __('authorize:md5_hash'),
        );

        $this->fields_descriptions = array(
            'api_key' => __("authorize:api_login_id_description"),
            'transaction_key' => __("authorize:api_login_id_description"),
            'md5_hash' => __("authorize:md5_hash_description"),
        );
    }

    public function generate_payment_form($unique_id, $item_name, $amount, $success, $cancel, $notify, $currency_code, $invoice_number) {

        require_once APPPATH . 'libraries/authorize/AuthorizeNet.php';
        $this->api_key = $this->get_field('api_key');
        $this->transaction_key = $this->get_field('transaction_key');

        $CI = &get_instance();
        $CI->load->model('invoices/partial_payments_m', 'ppm');

        # Convert $amount to USD if $currency_code is NOT USD
        if ($currency_code != 'USD') {
            $amount = $CI->ppm->getUsdAmountByAmountAndUniqueId($amount, $unique_id);
        }

        # Let's round the amount.
        $amount = round($amount, 2);

        $click_here = lang('paypal:clickhere');
        $fp_timestamp = time();
        $fp_sequence = $CI->ppm->getIdByUniqueId($unique_id); // Enter an invoice or other unique number.
        $fingerprint = AuthorizeNetSIM_Form::getFingerprint($this->api_key, $this->transaction_key, $amount, $fp_sequence, $fp_timestamp);

        # Live URL: https://secure.authorize.net/gateway/transact.dll
        # Test URL: https://test.authorize.net/gateway/transact.dll

        $invoice = __("global:invoice");
        $item_name = trim(str_ireplace($invoice, "", $item_name));

        $form = '<form method="post" action="https://secure.authorize.net/gateway/transact.dll">';
        $sim = new AuthorizeNetSIM_Form(
                array(
            'x_amount' => $amount,
            'x_fp_sequence' => $fp_sequence,
            'x_fp_hash' => $fingerprint,
            'x_fp_timestamp' => $fp_timestamp,
            'x_receipt_link_method' => 'POST',
            'x_receipt_link_text' => __('gateways:returntowebsite', array(Business::getBrandName())),
            'x_receipt_link_url' => $success,
            'x_line_item' => "Invoice<|>$item_name<|><|>1<|>$amount<|>",
            'x_login' => $this->api_key,
            'x_method' => 'cc',
            'x_show_form' => 'payment_form'
                )
        );
        $form .= $sim->getHiddenFieldString();
        $form .= '<input type="submit" value="' . $click_here . '"></form>';
        return $form;
    }

    public function process_success($unique_id) {
        return $this->process_notification($unique_id);
    }

    public function process_notification($unique_id) {
        define('AUTHORIZENET_API_LOGIN_ID', $this->get_field('api_key'));
        define('AUTHORIZENET_MD5_SETTING', $this->get_field('md5_hash'));
        require_once APPPATH . 'libraries/authorize/AuthorizeNet.php';
        $response = new AuthorizeNetSIM;
        if ($response->isAuthorizeNet()) {
            if ($response->approved) {
                return array(
                    'txn_id' => $response->transaction_id,
                    'payment_gross' => $response->amount,
                    'payment_date' => time(),
                    'payment_type' => 'instant',
                    'payer_status' => 'verified',
                    'payment_status' => 'Completed',
                    'item_name' => $unique_id,
                    'is_paid' => 1,
                );
            } else {
                $this->error("Authorize.net said that your payment was not approved.");
                return false;
            }
        } else {
            $this->error("Authorize.net said that your payment information was not valid.");
            return false;
        }
    }

}
