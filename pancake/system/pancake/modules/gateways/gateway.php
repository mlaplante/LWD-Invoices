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
 * The Gateway Class
 *
 * By way of reference: A field's type can be ENABLED, FIELD, CLIENT or INVOICE.
 * A ENABLED field simply defines if a gateway is enabled or not. A FIELD field
 * is a field that can be used by the payment gateway. A CLIENT field defines if
 * a payment gateway is enabled/disabled for a client, and a INVOICE field defines
 * if a payment gateway is enabled/disabled for an invoice.
 *
 * If there is no ENABLED field, it is assumed that the gateway is disabled.
 *
 * If there is no CLIENT field for a client, or no INVOICE field for an invoice,
 * it is assumed that the gateway is enabled for them.
 *
 * @subpackage	Gateway
 * @category	Payments
 */
abstract class Gateway extends Pancake_Model {

    public $gateway;
    public $title;
    public $frontend_title;
    public $table = 'gateway_fields';
    public $version = '1.0';
    public $show_version = false;
    public $author = 'Pancake Dev Team';
    public $notes = '';
    public $fields = array();
    public $fields_descriptions = array();
    public $autosubmit = false;
    public $client_fields = array();
    public $has_payment_page = true;
    public $supports_surcharges = true;
    public $requires_https = false;
    public $requires_pci = false;
    public $errors = array();
    public $fee = null;
    public $use_field_names = true;
    public $custom_head = '';
    public $post_url = '';
    public $unique_id = null;
    protected static $item_types_with_business_identity_id = ['ENABLED', 'FIELD', 'RECURRING_TOKEN'];

    public function __construct($gateway) {
        parent::__construct();
        $this->gateway = strtolower($gateway);
    }

    /**
     * Get the value of a given field for a gateway.
     * If $field is not provided, all fields will be returned.
     *
     * @param string $field
     * @return array|string
     */
    public function get_field($field = null) {
        $buffer = self::get_fields(Business::getBusinessId(), $this->gateway, 'FIELD', $field);
        return isset($buffer[0]['value']) ? trim($buffer[0]['value']) : '';
    }

    public function error($message) {
        $this->errors[] = $message;
    }

    public function get_errors() {
        return $this->errors;
    }

    public function has_errors() {
        return count($this->errors) > 0;
    }

    public function get_client_details($unique_id) {
        $CI = &get_instance();
        $CI->load->model('invoices/partial_payments_m', 'ppm');
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('clients/clients_m');
        $unique_invoice_id = $CI->ppm->getUniqueInvoiceIdByUniqueId($unique_id);
        $client_id = $CI->invoice_m->getClientIdByUniqueId($unique_invoice_id);
        return $CI->clients_m->getById($client_id);
    }

    public function get_client_field($field) {
        return isset($_POST['client_fields'][$field]) ? $_POST['client_fields'][$field] : null;
    }

    public static function get_fields($business_identity_id = null, $gateway = null, $type = null, $field = null) {
        $where = array();

        if ($business_identity_id !== null) {
            if (!is_numeric($business_identity_id)) {
                throw new Exception(var_export($business_identity_id, true) . " is not a valid business identity ID.");
            }

            $where['business_identity_id'] = $business_identity_id;
        }

        if ($gateway !== null) {
            $where['gateway'] = $gateway;
        }

        if ($type !== null) {
            $where['type'] = $type;
        }

        if ($field !== null) {
            $where['field'] = $field;
        }

        $CI = &get_instance();

        if (in_array($type, self::$item_types_with_business_identity_id)) {
            # Stop orphans.
            $business_identities = $CI->db->dbprefix("business_identities");
            $CI->db->where('business_identity_id in (select id from ' . $business_identities . ')', null, false);
        }

        return $CI->db->where($where)->get('gateway_fields')->result_array();
    }

    /**
     * Set the value of a field of a certain type for a gateway.
     *
     * @param integer $business_identity_id
     * @param string $gateway
     * @param string $field
     * @param mixed $value
     * @param string $type (ENABLED, FIELD, INVOICE or CLIENT)
     * @return boolean
     */
    public static function set_field($business_identity_id, $gateway, $field, $value, $type) {
        $CI = get_instance();

        $where = array(
            'business_identity_id' => $business_identity_id,
            'gateway' => $gateway,
            'field' => (string) $field, // (string) fixes a MySQL strict error.
            'type' => $type,
        );

        $data = array(
            'business_identity_id' => $business_identity_id,
            'gateway' => $gateway,
            'field' => (string) $field, // (string) fixes a MySQL strict error.
            'type' => $type,
            'value' => $value,
        );

        if ($CI->db->where($where)->count_all_results('gateway_fields') == 0) {
            return $CI->db->insert('gateway_fields', $data);
        } else {
            return $CI->db->where($where)->update('gateway_fields', $data);
        }
    }

    /**
     * Process the input from the settings page, store everything properly.
     *
     * @param array $gateways
     * @return boolean
     */
    public static function processSettingsInput($gateways) {
        $static_gateways = self::get_gateways();
        $checkbox_fields = [];

        foreach ($gateways as $business_identity_id => $gateway_data) {
            foreach ($static_gateways as $gateway_name => $static_gateway) {
                if (!isset($gateway_data[$static_gateway['gateway']])) {
                    $gateway_data[$static_gateway['gateway']] = [];
                }

                if (!isset($checkbox_fields[$gateway_name])) {
                    $checkbox_fields[$gateway_name] = [];
                }

                if (!isset($gateway_data[$static_gateway['gateway']]['enabled'])) {
                    $gateway_data[$static_gateway['gateway']]['enabled'] = 0;
                }

                foreach ($static_gateway["fields"] as $field_name => $field) {
                    if ($field["type"] == "checkbox") {
                        $checkbox_fields[$gateway_name][] = $field_name;
                    }
                }
            }

            foreach ($gateway_data as $gateway => $fields) {

                foreach ($checkbox_fields[$gateway] as $checkbox_field) {
                    # It's an unchecked checkbox; set its value.

                    if (!isset($fields[$checkbox_field])) {
                        $fields[$checkbox_field] = 0;
                    }
                }

                foreach ($fields as $field => $value) {
                    $value = trim($value);

                    if ($field == 'enabled') {
                        $type = 'ENABLED';
                    } else {
                        $type = 'FIELD';
                    }
                    if (!self::set_field($business_identity_id, $gateway, $field, $value, $type)) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    public static function duplicateInvoiceGateways($old_invoice_id, $new_invoice_id) {
        $CI = &get_instance();
        $buffer = $CI->db->get_where('gateway_fields', array('type' => 'INVOICE', 'field' => $old_invoice_id))->result_array();
        foreach ($buffer as $row) {
            self::set_field(null, $row['gateway'], $new_invoice_id, $row['value'], 'INVOICE');
        }
        return true;
    }

    public static function processItemInput($item_type, $item, $gateways) {
        $enabled = self::get_enabled_gateways();

        foreach ($enabled as $field) {
            if (!isset($gateways[$field['gateway']])) {
                $gateways[$field['gateway']] = 0;
            }
        }

        foreach ($gateways as $gateway => $enabled) {
            if (!self::set_field(null, $gateway, $item, $enabled, $item_type)) {
                return false;
            }
        }

        return true;
    }

    private static function get_gateway_list($gateway = null) {
        $gateways = array();
        if ($gateway === null) {
            clearstatcache();
            clearstatcache(true);
            foreach (scandir(APPPATH . 'modules/gateways/models') as $file) {
                if (substr($file, strlen($file) - 4, 4) == '.php') {
                    $file = str_ireplace('.php', '', $file);
                    if (file_exists(APPPATH . 'modules/gateways/models/' . $file . '.php')) {
                        require_once APPPATH . 'modules/gateways/models/' . $file . '.php';
                        if (class_exists(ucfirst($file))) {
                            $gateways[$file] = $file;
                        }
                    }
                }
            }
        } else {
            $file = strtolower($gateway);
            if (file_exists(APPPATH . 'modules/gateways/models/' . $file . '.php')) {
                require_once APPPATH . 'modules/gateways/models/' . $file . '.php';
                if (class_exists(ucfirst($file))) {
                    $gateways[$file] = $file;
                }
            }
        }

        foreach (array_keys($gateways) as $file) {
            # Ignore hidden gateway files.
            if (substr($file, 0, 2) == "._") {
                unset($gateways[$file]);
            }
        }

        return $gateways;
    }

    public static function get_gateways($business_identity_id = null, $gateway = null, $include_gateways_with_no_payment_page = true) {
        $return = array();
        $enabled = self::get_fields($business_identity_id, $gateway, 'ENABLED');
        $fields = self::get_fields($business_identity_id, $gateway, 'FIELD');
        $gateways = self::get_gateway_list($gateway);

        foreach ($gateways as $file) {
            $object = ucfirst($file);
            $object = new $object();

            $object_fields = [];
            foreach ($object->fields as $field => $value) {
                if (is_array($value)) {
                    $object_fields[$field] = $value;
                } else {
                    $object_fields[$field] = [
                        "label" => $value,
                    ];

                    if (isset($object->fields_descriptions[$field])) {
                        $object_fields[$field]["help"] = $object->fields_descriptions[$field];
                    }
                }

                if (!isset($object_fields[$field]["type"])) {
                    $object_fields[$field]["type"] = "text";
                }
            }

            $return[$file] = array(
                'gateway' => $file,
                'title' => $object->title,
                'frontend_title' => empty($object->frontend_title) ? $object->title : $object->frontend_title,
                'enabled' => false,
                'version' => $object->version,
                'show_version' => $object->show_version,
                'author' => $object->author,
                'fields' => $object_fields,
                'has_payment_page' => $object->has_payment_page,
                'supports_surcharges' => $object->supports_surcharges,
                'requires_https' => $object->requires_https,
                'requires_pci' => $object->requires_pci,
                'notes' => $object->notes,
                'field_values' => array(),
            );

            if (isset($return[$file]["fields"]["surcharge"])) {
                throw new DomainException("The 'surcharge' field name is reserved by Pancake and cannot be used by a gateway.");
            }

            if ($object->supports_surcharges) {
                $return[$file]["fields"]['surcharge'] = [
                    "label" => __("gateways:surcharge_percentage"),
                    "help" => __("gateways:surcharge_percentage_explanation"),
                    "type" => "text",
                ];
                $return[$file]['field_values']['surcharge'] = 0;
            }
        }

        foreach ($fields as $field) {

            if (!isset($return[$field['gateway']])) {
                continue;
            }

            $return[$field['gateway']]['field_values'][$field['field']] = $field['value'];
        }

        foreach ($enabled as $field) {

            if (!isset($return[$field['gateway']])) {
                continue;
            }

            if ($field['value'] > 0) {
                $return[$field['gateway']]['enabled'] = true;
            }
        }

        if (!$include_gateways_with_no_payment_page) {
            foreach ($return as $key => $value) {
                if (!$value["has_payment_page"]) {
                    unset($return[$key]);
                }
            }
        }

        if ($gateway != null) {
            $return = $return[$gateway];
        }

        return $return;
    }

    public static function get_enabled_gateways_per_business_identity($business_identity_id = null) {
        static $enabled_gateways;

        if ($enabled_gateways === null) {
            $businesses = get_instance()->business_identities_m->getAllBusinessesDropdown();
            $enabled_gateways = [];
            foreach ($businesses as $business_id => $business) {
                $enabled_gateways[$business_id] = [];
                foreach (self::get_gateways($business_id) as $gateway => $fields) {
                    if ($fields['enabled']) {
                        $enabled_gateways[$business_id][] = $gateway;
                    }
                }
            }
        }

        return $business_identity_id ? $enabled_gateways[$business_identity_id] : $enabled_gateways;
    }

    /**
     * Returns any gateway enabled for at least one business identity.
     * @return array
     */
    public static function get_enabled_gateways() {
        $gateways = self::get_gateways();
        $return = array();
        foreach ($gateways as $gateway => $fields) {
            if ($fields['enabled']) {
                $return[$gateway] = $fields;
            }
        }

        return $return;
    }

    public static function get_enabled_gateway_select_array($include_no_gateway, $client_id, $include_no_payment_page = true) {
        $CI = get_instance();
        $CI->load->model("clients/clients_m");
        $balance = $CI->clients_m->get_balance($client_id);
        $business_identity_id = $CI->clients_m->get_business_identity_per_client($client_id);

        $gateways = self::get_gateways($business_identity_id);

        if ($include_no_gateway) {
            $return = array(
                '' => __('gateways:nogatewayused'),
                'credit-balance' => __('clients:credit_balance_currently', array(Currency::format($balance))),
            );
        } else {
            $return = array();
        }

        foreach ($gateways as $key => $gateway) {
            if ($gateway['enabled'] || ($include_no_payment_page && !$gateway['has_payment_page'])) {
                $return[$key] = $gateway['title'];
            }
        }
        return $return;
    }

    public static function get_frontend_gateways($invoice_id = null) {
        $buffer = self::get_item_gateways('INVOICE', $invoice_id, true);
        $enabled = self::get_enabled_gateways();

        $return = array();
        foreach ($buffer as $gateway) {
            if ($gateway['has_payment_page'] and isset($enabled[$gateway['gateway']])) {
                $return[$gateway['gateway']] = $gateway;
            }
        }
        
        return $return;
    }

    /**
     * Returns a list of gateways enabled in Settings AND enabled for a specific item.
     *
     * Example return value:
     * array('cash_m', 'stripe_m');
     *
     * @param string $type The type of the item (e.g. INVOICE)
     * @param integer $item The ID of the item.
     * @param boolean $include_data Whether to include gateway data or just return their names.
     * @return array
     */
    public static function get_item_gateways($type, $item = null, $include_data = false) {
        switch ($type) {
            case "INVOICE":
                $CI = get_instance();
                $CI->load->model("invoices/invoice_m");
                $CI->load->model("clients/clients_m");
                $client_id = $CI->invoice_m->getClientIdById($item);
                $business_identity_id = $CI->clients_m->get_business_identity_per_client($client_id);
                break;
            default:
                throw new Exception("get_item_gateways() does not yet support type '$type'.");
        }

        $gateways = self::get_fields(null, null, $type, $item);
        # That's all the gateways for $type, with value $item. Okay.

        $available_gateways = self::get_gateways($business_identity_id);
        foreach ($gateways as $key => $gateway) {
            if (!in_array($gateway['gateway'], array_keys($available_gateways))) {
                unset($gateways[$key]);
            }
        }

        $return = array();

        if (!isset($_POST['gateways'])) {
            foreach ($available_gateways as $gateway => $details) {
                $return[$gateway] = $details['enabled'];
            }

            foreach ($gateways as $gateway) {
                $return[$gateway['gateway']] = (bool) $gateway['value'];
            }
        } else {
            foreach ($available_gateways as $gateway => $details) {
                $return[$gateway] = false;
            }

            foreach ($_POST['gateways'] as $gateway => $value) {
                $return[$gateway] = true;
            }
        }

        # Force-disable any gateways that are not enabled in settings.
        $enabled_gateways = self::get_enabled_gateways_per_business_identity($business_identity_id);
        foreach ($return as $gateway => $value) {
            if (!in_array($gateway, $enabled_gateways)) {
                $return[$gateway] = false;
            }
        }

        if ($include_data) {
            $buffer = $return;
            $return = array();

            foreach ($buffer as $gateway => $value) {
                if ($value) {
                    $return[$gateway] = self::get_gateways(null, $gateway);
                }
            }
        }

        return $return;
    }

    public static function get_surcharge($client_id, $gateway) {
        $CI = get_instance();
        $CI->load->model('clients/clients_m');
        $CI->load->model('clients/clients_meta_m');

        $business_identity_id = $CI->clients_m->get_business_identity_per_client($client_id);
        $gateway_details = self::get_gateways(null, $gateway);
        $surcharge = self::get_fields($business_identity_id, $gateway, 'FIELD', "surcharge");
        $surcharge = isset($surcharge[0]['value']) ? trim($surcharge[0]['value']) : '';

        $custom = get_instance()->clients_meta_m->fetch($client_id);

        $key = strtolower($gateway_details['title']) . "-transaction-fee";
        if (isset($custom[$key]) && $custom[$key]['value'] !== null) {
            $surcharge = $custom[$key]['value'];
        }

        $key = strtolower($gateway_details['title']) . "-fee";
        if (isset($custom[$key]) && $custom[$key]['value'] !== null) {
            $surcharge = $custom[$key]['value'];
        }

        $surcharge = str_replace('%', '', $surcharge);
        $surcharge = trim($surcharge);


        if (empty($surcharge)) {
            $surcharge = 0;
        }
        
        $surcharge_percentage = $surcharge / 100;
        return $surcharge_percentage;
    }

    public static function complete_payment($unique_id, $gateway, $data) {
        $CI = &get_instance();

        $CI->load->model('invoices/invoice_m');
        $CI->load->model('clients/clients_m');
        $CI->load->model('clients/clients_taxes_m');
        $CI->load->model('invoices/partial_payments_m', 'ppm');
        $CI->load->model('files/files_m');
        $CI->load->model('tickets/ticket_m');

        if ($data) {
            if (isset($data["unique_id"]) && !empty($data["unique_id"])) {
                $unique_id = $data["unique_id"];
            }

            $part = $CI->ppm->getPartialPayment($unique_id);
            $invoice = $part['invoice'];

            if ($part['is_paid'] and $data['is_paid']) {
                # Was already paid, and this is a repeated notification. Ignore it.
                return true;
            }

            # Calculate the portion of the payment that went towards the gateway surcharge.
            $surcharge_percentage = self::get_surcharge($invoice['client_id'], $gateway);

            if ($surcharge_percentage > 0) {
                $amount = round($part['billableAmount'], 2);
                $net_surcharge = round($amount * $surcharge_percentage, 2);
                $data["payment_gross"] = $data["payment_gross"] - $net_surcharge;
                $data['gateway_surcharge'] = $net_surcharge;
            }

            $data['payment_method'] = $gateway;
            $CI->ppm->updatePartialPayment($unique_id, $data);
            $CI->invoice_m->fixInvoiceRecord($part['unique_invoice_id']);

            if($CI->ticket_m->has_invoice($invoice['id'])){
                $ticket = $CI->ticket_m->get_by('tickets.invoice_id',$invoice['id']);

                $CI->ticket_m->update($ticket->id, array('is_paid'=>1),TRUE);
            }

            get_instance()->load->model('notifications/notification_m');
            Notify::client_paid_invoice($invoice['id'], $invoice['client_id']);
            $CI->invoice_m->send_payment_receipt_emails($unique_id, $gateway, $data);

            if ($surcharge_percentage > 0) {
                $gateway_details = Gateway::get_gateways(null, $gateway);

                $fee_is_taxable = (Settings::get("tax_transaction_fees") == "1");
                $fee_tax_ids = $fee_is_taxable ? $CI->clients_taxes_m->get_default($invoice['client_id']) : [];

                $new_invoice = [
                    "created_at" => now()->timestamp,
                    "client_id" => $invoice['client_id'],
                    "currency_id" => $invoice["currency_id"],
                    "exchange_rate" => $invoice["exchange_rate"],
                    "parts" => [
                        [
                            "key" => 1,
                            "is_percentage" => 1,
                            "amount" => 100,
                            "due_date" => now()->timestamp,
                            "notes" => "",
                            "payment_date" => now()->timestamp,
                            "payment_method" => $gateway,
                            "payment_status" => "Completed",
                        ],
                    ],
                    "items" => [
                        [
                            "name" => __("gateways:surcharge_invoice", [$gateway_details["title"], $invoice["invoice_number"]]),
                            "type" => "flat_rate",
                            "qty" => 1,
                            "rate" => $CI->tax_m->calculate_amount_excluding_tax($data['gateway_surcharge'], $fee_tax_ids),
                            "tax_ids" => $fee_tax_ids,
                        ],
                    ],
                ];

                # Generate an already-paid invoice for the surcharge amount.
                $unique_id = $CI->invoice_m->insert($new_invoice);
                if (!$unique_id) {
                    throw new Exception("An unknown error occurred while trying to create an invoice for the gateway surcharge payment.");
                }
            }

            return true;
        }
    }

    public static function get_generate_data_from_unique_id($unique_id, $gateway) {
        $CI = get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('invoices/partial_payments_m', 'ppm');

        $part = $CI->ppm->getPartialPayment($unique_id);
        $invoice = $part['invoice'];
        unset($part['invoice']);

        if (!isset($part['id']) or count(Gateway::get_frontend_gateways($invoice['real_invoice_id'])) == 0) {
            redirect('');
            return;
        }

        $gateways = Gateway::get_frontend_gateways($invoice['id']);

        if (!$gateway and count($gateways) == 1) {
            foreach (array_keys($gateways) as $key) {
                $gateway = $key;
            }
        }

        $item_name = __("invoices:invoicenumber", [$invoice['invoice_number']]);
        $amount = round($part['billableAmount'], 2);
        $success = site_url('transaction/success/' . $unique_id . '/' . $gateway);
        $cancel = site_url('transaction/cancel/' . $unique_id . '/' . $gateway);
        $notify = site_url('transaction/ipn/' . $unique_id . '/' . $gateway);
        $currency_code = $invoice['currency_code'] ? $invoice['currency_code'] : Currency::code();

        $surcharge_percentage = self::get_surcharge($invoice['client_id'], $gateway);
        $amount = round($amount + ($amount * $surcharge_percentage), 2);

        # If you alter this array, be mindful of the order of the keys.
        # This array is used in call_user_func_array(), so the order matters.
        return array(
            'unique_id' => $unique_id,
            'item_name' => $item_name,
            'amount' => $amount,
            'success' => $success,
            'cancel' => $cancel,
            'notify' => $notify,
            'currency_code' => $currency_code,
            'invoice_number' => $invoice['invoice_number'],
            'surcharge_percentage' => self::get_surcharge($invoice['client_id'], $gateway),
        );
    }

    public function create_charge($client_id, $item_name, $amount, $currency_code) {

    }

    public function generate_payment_form($unique_id, $item_name, $amount, $success, $cancel, $notify, $currency_code, $invoice_number) {

    }

    public function generate_client_fields($unique_id, $item_name, $amount, $success, $cancel, $notify, $currency_code, $invoice_number) {
        return $this->client_fields;
    }

    public function process_cancel($unique_id) {

    }

    public function process_success($unique_id) {

    }

    public function process_notification($unique_id) {

    }

    /**
     * Retrieves a list of enabled gateways that have a payment token associated with them and can be auto-charged.
     *
     * @param integer $client_id
     *
     * @return array
     */
    public static function get_token_enabled_gateways($client_id) {
        $gateway_list = self::get_enabled_gateway_select_array(false, $client_id, false);
        $gateways = [];

        foreach ($gateway_list as $gateway => $label) {
            if (self::get_token_static($gateway, $client_id, 1, Settings::get("currency"))) {
                $gateways[] = $gateway;
            }
        }

        return $gateways;
    }

    public static function get_clients_with_valid_tokens() {
        $clients = [];
        foreach (self::get_enabled_gateways_per_business_identity() as $business_identity_id => $enabled_gateways) {
            foreach (self::get_fields($business_identity_id, null, "RECURRING_TOKEN") as $buffer) {
                if (!in_array($buffer['gateway'], $enabled_gateways)) {
                    continue;
                }

                if (empty(trim($buffer['value']))) {
                    continue;
                }

                $token = isset($buffer['value']) ? json_decode($buffer['value'], true) : '';
                $token = self::validate_token($token);
                if ($token) {
                    $clients[] = (int) $buffer['field'];
                }
            }
        }

        return $clients;
    }

    public static function charge($partial_payment_unique_id) {
        $CI = &get_instance();
        $CI->load->model('invoices/partial_payments_m', 'ppm');
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('clients/clients_m');
        $part = $CI->ppm->getPartialPayment($partial_payment_unique_id);
        $invoice = $part['invoice'];
        unset($part['invoice']);
        $client_id = $invoice['client_id'];

        $gateways = self::get_token_enabled_gateways($client_id);

        if (count($gateways)) {
            foreach ($gateways as $gateway) {
                $CI->load->model('gateways/' . $gateway);
                $data = Gateway::get_generate_data_from_unique_id($partial_payment_unique_id, $gateway);

                Business::setBusinessFromClient($client_id);
                $result = $CI->$gateway->create_charge($client_id, $data['item_name'], $data['amount'], $data['currency_code']);

                if ($result) {
                    return !!Gateway::complete_payment($partial_payment_unique_id, $gateway, $result);
                }
            }
        }

        # Could not make a successful charge.
        return false;
    }

    public function set_token($client_id, $token, \Carbon\Carbon $expiry_date, $limit = null, $limit_currency_code = null) {
        $limit = $limit ? $limit : PHP_INT_MAX;
        $limit_currency_code = $limit_currency_code ? $limit_currency_code : Settings::get("currency");

        $business_identity_id = get_instance()->clients_m->get_business_identity_per_client($client_id);
        self::set_field($business_identity_id, $this->gateway, $client_id, json_encode([
            "token" => $token,
            "limit" => $limit,
            "limit_currency_code" => $limit_currency_code,
            "expiry_date" => $expiry_date->timestamp,
        ]), "RECURRING_TOKEN");
    }

    public function unset_token($client_id) {
        $business_identity_id = get_instance()->clients_m->get_business_identity_per_client($client_id);
        self::set_field($business_identity_id, $this->gateway, $client_id, "", "RECURRING_TOKEN");
    }

    public function get_token($client_id, $amount, $currency_code) {
        return self::get_token_static($this->gateway, $client_id, $amount, $currency_code);
    }

    protected static function validate_token($token) {
        # Check the expiry date.
        $expiry_date = carbonstamp($token["expiry_date"]);
        if ($expiry_date->isPast()) {
            return null;
        }

        # Check that the limit is higher than what is being charged.
        if ($token["limit"]) {
            $token_limit_in_default_currency = Currency::convert($token["limit"], $token["limit_currency_code"]);
            $amount_in_default_currency = Currency::convert(1, Settings::get("currency"));

            if ($amount_in_default_currency >= $token_limit_in_default_currency) {
                return null;
            }

            # Limit is lower, and it has a valid expiry date, so return the token.
            return $token["token"];
        } else {
            # There is no token, return it.
            return $token["token"];
        }
    }

    protected static function get_token_static($gateway, $client_id, $amount, $currency_code) {
        $business_identity_id = get_instance()->clients_m->get_business_identity_per_client($client_id);
        $buffer = self::get_fields($business_identity_id, $gateway, "RECURRING_TOKEN", $client_id);
        $token = isset($buffer[0]['value']) ? json_decode($buffer[0]['value'], true) : '';
        if ($token) {
            return self::validate_token($token);
        } else {
            return null;
        }
    }

    public static function search($query) {
        $buffer = array();
        $details = array();
        $query = strtolower($query);

        foreach (self::get_gateways() as $gateway => $label) {
            $label = $label['title'];
            $subbuffer = array();
            $subbuffer[] = levenshtein($query, strtolower($gateway), 1, 20, 20);
            $subbuffer[] = levenshtein($query, strtolower($label), 1, 20, 20);
            sort($subbuffer);
            $buffer[$gateway] = reset($subbuffer);
            $details[$gateway] = $label;
        }

        asort($buffer);
        $return = array();

        foreach (array_slice($buffer, 0, 3, true) as $id => $levenshtein) {
            $return[] = array(
                'levenshtein' => $levenshtein,
                'name' => $details[$id],
                'id' => $id,
            );
        }

        return $return;
    }

}