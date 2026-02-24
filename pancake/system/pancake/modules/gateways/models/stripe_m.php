<?php

use Stripe\StripeClient;

defined('BASEPATH') or exit('No direct script access allowed');
/**
 * Pancake
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
 * The Stripe Gateway
 *
 * @subpackage    Gateway
 * @category      Payments
 */
class Stripe_m extends Gateway
{

    public $requires_https = true;
    public $requires_pci = false;
    public $default_custom_head = <<<stuff
<style>

.client_fields .StripeElement {
    display: block;
    border: 1px solid #ccc;
    padding: 1em;
}

</style>
<script src="https://js.stripe.com/v3/"></script>
<script>
var stripe = Stripe('{{publishable_key}}');

var elements = stripe.elements();
var cardElement = elements.create('card');

$(document).ready(function() {
    cardElement.mount('.client_fields .row:nth-child(4)');
    
    var cardholderName = document.getElementById('cc_name');
    var setupForm = document.getElementById('payment-form');
    var clientSecret = "{{intent}}";
    var payment_method_id = "{{payment_method_id}}";
    var isSubmitting = false;
    
    if (payment_method_id !== "") {
        $('.submit-button').prop('disabled', true);
        stripe.confirmCardPayment(
            clientSecret,
            {
              payment_method: payment_method_id,
            }
          ).then(function(result) {
            if (result.error) {
                // Display error.message in your UI.
                $('.submit-button').prop('disabled', false);
                $('.errors').text(result.error.message);
            } else {
              // The setup has succeeded.
                isSubmitting = true;
                $(setupForm).append($('<input type="hidden" name="client_fields[intent]" />').val(clientSecret));
                $(setupForm).submit();
            }
          });
    }
    
    setupForm.addEventListener('submit', function(ev) {
            if (isSubmitting) {
                return;
            }
            
          $('.submit-button').prop('disabled', true);
          ev.preventDefault();
          stripe.confirmCardSetup(
            clientSecret,
            {
              payment_method: {
                card: cardElement,
                billing_details: {
                  name: cardholderName.value,
                },
              },
            }
          ).then(function(result) {
            if (result.error) {
                // Display error.message in your UI.
                $('.submit-button').prop('disabled', false);
                $('.errors').text(result.error.message);
            } else {
              // The setup has succeeded.
                isSubmitting = true;
                $(setupForm).submit();
            }
          });
        });
});

</script>
stuff;

    function __construct()
    {
        parent::__construct(__CLASS__);
        $this->title = 'Stripe';
        $this->frontend_title = __('paypalpro:viacreditcard');

        if (!defined('GATEWAY_API_KEY')) {
            define('GATEWAY_API_KEY', $this->get_field('publishable_key'));
        }

        $this->fields = array(
            'api_key' => "Stripe Secret Key",
            'publishable_key' => "Stripe Publishable Key",
        );

        $this->client_fields = array(
            'cc_name' => array(
                'label' => __('gateways:cc_cardholder'),
            ),
            'cc_number' => array(
                'label' => __('gateways:cc_number'),
            ),
            'cc_permission' => [
                'label' => __('gateways:cc_permission'),
                'type' => 'checkbox',
            ],
        );
    }

    protected function refreshCustomHead($intent_client_secret = "", $payment_method_id = "")
    {
        $custom_head = str_ireplace("{{publishable_key}}", $this->get_field('publishable_key'), $this->default_custom_head);
        $custom_head = str_ireplace("{{intent}}", $intent_client_secret, $custom_head);
        $custom_head = str_ireplace("{{payment_method_id}}", $payment_method_id, $custom_head);
        $this->custom_head = $custom_head;

        # Force update the variable in the theme.
        get_instance()->template->custom_head = $this->custom_head;
    }

    public function setup_stripe()
    {
        \Stripe\Stripe::setApiKey($this->get_field('api_key'));
        $this->load->config("stripe");
        $curlopts = $this->config->item('stripe_curlopts');
        $curl = new \Stripe\HttpClient\CurlClient($curlopts);
        \Stripe\ApiRequestor::setHttpClient($curl);
        \Stripe\Stripe::setAppInfo("Pancake", Settings::get('version'), "https://www.pancakeapp.com");
    }

    public function generate_client_fields($unique_id, $item_name, $amount, $success, $cancel, $notify, $currency_code, $invoice_number)
    {
        $this->setup_stripe();

        if (!isset($_POST["client_fields"])) {
            $intent = \Stripe\SetupIntent::create([
                'customer' => $this->getStripeCustomerFromInvoiceUniqueId($unique_id)->id,
            ]);

            $this->refreshCustomHead($intent->client_secret);
        }

        $this->client_fields["cc_permission"]["label"] = __('gateways:cc_permission', [Business::getBrandName()]);

        return $this->client_fields;
    }

    protected function getStripeCustomerFromInvoiceUniqueId(string $unique_id): \Stripe\Customer
    {
        $invoice_id = $this->ppm->getUniqueInvoiceIdByUniqueId($unique_id);
        $client_id = $this->invoice_m->getClientIdByUniqueId($invoice_id);
        return $this->getStripeCustomerFromClientId($client_id);
    }

    protected function getStripeCustomerFromClientId(string $client_id): \Stripe\Customer
    {
        $client = $this->clients_m->getById($client_id);
        $client_email = explode(',', $client["email"])[0];

        $stripe = new StripeClient(
            $this->get_field('api_key')
        );
        $customer = $stripe->customers->all(['email' => $client_email, 'limit' => 1])->first();

        if (!$customer) {
            $customer = \Stripe\Customer::create(array(
                "description" => client_name($client_id),
                "email" => $client_email,
            ));
        }

        return $customer;
    }

    public function create_charge($client_id, $item_name, $amount, $currency_code)
    {
        $this->setup_stripe();

        $token = $this->get_token($client_id, $amount, $currency_code);
        if ($token) {
            if (is_string($token)) {
                # It's one of the pre-rework tokens, use the pre-rework code to charge the card.
                return $this->create_charge_from_old_token($token, $client_id, $item_name, $amount, $currency_code);
            } else {
                $customer_id = $token["customer_id"];
                $method_id = $token["payment_method_id"];
            }
        } else {
            # Try to charge with an available payment method (it would be the method that just got created, but not saved in Pancake because the client didn't want it):
            $customer = $this->getStripeCustomerFromClientId($client_id);
            $method = \Stripe\PaymentMethod::all([
                'customer' => $customer->id,
                'type' => 'card',
            ])->first();

            $customer_id = $customer->id;
            $method_id = $method->id;

            /** @var \Stripe\PaymentMethod $method */
        }

        try {
            if (isset($_POST["client_fields"]["intent"])) {
                # We're finishing up a charge that needed authorization:
                $intent_id = explode("_secret_", $_POST["client_fields"]["intent"])[0];
                $payment = \Stripe\PaymentIntent::retrieve($intent_id);
            } else {
                $payment = \Stripe\PaymentIntent::create([
                    "amount" => $amount * 100,
                    "currency" => strtolower($currency_code),
                    "description" => $item_name,
                    'customer' => $customer_id,
                    'payment_method' => $method_id,
                    'off_session' => true,
                    'confirm' => true,
                ]);
            }

            $charge = $payment->charges->first();
            /** @var \Stripe\Charge $charge */

            $balance_transaction = \Stripe\BalanceTransaction::retrieve($charge->balance_transaction);
            $transaction_fee = $balance_transaction->fee / 100;

            return array(
                'txn_id' => $charge->id, // the gateway transaction ID
                'payment_gross' => $amount, // the amount paid, rounded to 2 decimal places
                'transaction_fee' => $transaction_fee, // the fee charged by the gateway, rounded to 2 decimal places
                'payment_date' => $charge->created, // a UNIX timestamp for the payment date
                'payment_status' => 'Completed', // One of: Completed/Pending/Refunded/Unpaid
                'item_name' => $item_name, // the item name (passed to the gateway in generate_payment_form())
                'is_paid' => true, // true or false, depending on whether payment was successful or not
            );

        } catch (\Stripe\Exception\CardException $e) {
            if ($e->getError()->code == "authentication_required" && isset($_POST["client_fields"])) {
                # The user is still in the browser, let them authenticate:
                $this->refreshCustomHead($e->getError()->payment_intent->client_secret, $method_id);
                $this->error($e->getError()->message);
                return false;
            } else {
                $this->unset_token($client_id);

                $intent = \Stripe\SetupIntent::create([
                    'customer' => $this->getStripeCustomerFromClientId($client_id)->id,
                ]);
                $this->refreshCustomHead($intent->client_secret);
                $this->error($e->getError()->message);
                return false;
            }
        }
    }

    protected function create_charge_from_old_token($token, $client_id, $item_name, $amount, $currency_code)
    {
        try {
            $charge = \Stripe\Charge::create(array(
                "amount" => $amount * 100,
                "currency" => strtolower($currency_code),
                "customer" => $token,
                "description" => $item_name,
            ));
        } catch (\Stripe\Exception\CardException $e) {
            $this->unset_token($client_id);
            $this->error($e->getMessage());
            return false;
        }

        if ($charge->paid) {
            $balance_transaction = \Stripe\BalanceTransaction::retrieve($charge->balance_transaction);
            $transaction_fee = $balance_transaction->fee / 100;

            return array(
                'txn_id' => $charge->id, // the gateway transaction ID
                'payment_gross' => $amount, // the amount paid, rounded to 2 decimal places
                'transaction_fee' => $transaction_fee, // the fee charged by the gateway, rounded to 2 decimal places
                'payment_date' => $charge->created, // a UNIX timestamp for the payment date
                'payment_status' => 'Completed', // One of: Completed/Pending/Refunded/Unpaid
                'item_name' => $item_name, // the item name (passed to the gateway in generate_payment_form())
                'is_paid' => true, // true or false, depending on whether payment was successful or not
            );
        } else {
            $this->unset_token($client_id);
            $this->error("Error {$charge->failure_code}: {$charge->failure_message}");
            return false;
        }
    }

    public function generate_payment_form($unique_id, $item_name, $amount, $success, $cancel, $notify, $currency_code, $invoice_number)
    {
        $this->setup_stripe();

        $invoice_id = $this->ppm->getUniqueInvoiceIdByUniqueId($unique_id);
        $client_id = $this->invoice_m->getClientIdByUniqueId($invoice_id);
        $customer = $this->getStripeCustomerFromClientId($client_id);
        $can_save = isset($_POST["client_fields"]["cc_permission"]) && $_POST["client_fields"]["cc_permission"] == "1";

        if (isset($_POST["client_fields"]["intent"])) {
            # We're finishing up a charge that needed authorization, we don't need to store this in any way:
            return $this->create_charge($client_id, $item_name, $amount, $currency_code);
        }

        $method = \Stripe\PaymentMethod::all([
            'customer' => $customer->id,
            'type' => 'card',
        ])->first();

        /** @var \Stripe\PaymentMethod $method */


        if (!$method) {
            $this->error("It doesn't seem like your credit card details were processed correctly. Please try again.");
            return false;
        }

        # Save credit card details for future use ONLY if the customer agreed to it.
        if ($can_save) {
            $expiry_date = carbon("{$method->card->exp_year}-{$method->card->exp_month}-01");
            $this->set_token($client_id, ["customer_id" => $customer->id, "payment_method_id" => $method->id], $expiry_date);
        }

        return $this->create_charge($client_id, $item_name, $amount, $currency_code);
    }
}