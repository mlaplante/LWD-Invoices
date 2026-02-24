<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2010, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link           http://pancakeapp.com
 * @since          Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * The Invoice API controller
 *
 * @subpackage    Controllers
 * @category      API
 */
class Invoices extends REST_Controller {

    public function __construct() {
        parent::__construct();

        $this->load->model('invoices/invoice_m');
    }

    /**
     * Get All Invoices
     * Parameters:
     *  + limit = 5
     *  + start = 0
     *  + sort_by = email (default: id)
     *  + sort_dir = asc (default: asc)
     *  + client_id = Clients ID
     *
     * @link   /api/1/invoices   GET Request
     */
    public function index_get($type = null) {
        $this->list_get($type);
    }

    /**
     * Get Paid Invoices
     *
     * @link   /api/1/invoices/paid   GET Request
     */
    public function paid_get() {
        $this->list_get('paid');
    }

    /**
     * Get Unpaid Invoices
     *
     * @link   /api/1/invoices/unpaid   GET Request
     */
    public function unpaid_get() {
        $this->list_get('unpaid');
    }

    /**
     * Get Overdue Invoices
     *
     * @link   /api/1/invoices/overdue   GET Request
     */
    public function overdue_get() {
        $this->list_get('overdue');
    }

    /**
     * Get Unsent Invoices
     *
     * @link   /api/1/invoices/unsent   GET Request
     */
    public function unsent_get() {
        $this->list_get('unsent');
    }

    /**
     * Get Estimates
     *
     * @link   /api/1/invoices/estimate   GET Request
     */
    public function estimate_get() {
        $this->list_get('estimate');
    }

    /**
     * Get Invoices
     * This isn't really accessed directly and it is more beneficial to just
     * utilize the quick methods above.
     * This endpoint won't be documented, but will remain for backward compatability
     *
     * @link   /api/1/invoices/list[/$type]   GET Request
     */
    public function list_get($type = null) {
        if ($this->get('limit') or $this->get('start')) {
            $this->invoice_m->limit($this->get('limit'), $this->get('start'));
        }

        if ($this->get('client_id')) {
            $this->invoice_m->where('client_id', $this->get('client_id'));
        }

        switch ($type) {
            case 'unsent':
                $this->invoice_m->where(array('invoices.last_sent' => 0, 'invoices.type !=' => 'ESTIMATE'));
                break;

            case 'paid':
                $this->invoice_m->where(array('invoices.is_paid' => 1, 'invoices.type !=' => 'ESTIMATE'));
                break;

            // Required to be sent
            case 'unpaid':
                $this->invoice_m->where(array(
                    'invoices.is_paid' => 0,
                    'invoices.last_sent !=' => 0,
                    'invoices.type !=' => 'ESTIMATE',
                ));
                break;

            // Required to be sent
            case 'overdue':
                $this->invoice_m->where(array(
                    'invoices.is_paid' => 0,
                    'invoices.last_sent !=' => 0,
                    'due_date <' => time(),
                    'invoices.type !=' => 'ESTIMATE',
                ));
                break;

            case 'estimate':
                $this->invoice_m->where(array('invoices.type' => 'ESTIMATE'));
                break;

            // If getting all invoices, don't get estimates
            default:
                $this->invoice_m->where(array('invoices.type !=' => 'ESTIMATE'));
        }

        $sort_by = $this->get('sort_by') ? $this->get('sort_by') : 'invoices.id';
        $sort_dir = $this->get('sort_dir') ? $this->get('sort_dir') : 'asc';

        $invoices = $this->invoice_m->order_by($sort_by, $sort_dir)->get_all_for_api();

        $count = count($invoices);
        $invoice_type = (is_null($type)) ? "invoices" : ($type === 'estimate' ? "estimates" : "$type invoices");

        $this->response(array(
            'status' => true,
            'message' => "Found $count $invoice_type",
            'invoices' => $invoices,
            'count' => $count,
        ), 200);
    }

    public function fetch_get($type = null) {
        $options = array(
            'include_totals' => !!$this->get('include_totals'),
            'include_partials' => !!$this->get('include_partials'),
            'return_object' => true,
            'type' => $type == 'estimates' ? 'estimates' : 'invoices',
            'offset' => $this->get('start') ? $this->get('start') : 0,
            'per_page' => $this->get('limit') ? $this->get('limit') : PHP_INT_MAX,
            'client_id' => $this->get('client_id') > 0 ? $this->get('client_id') : null,
            'unique_id' => $this->get('unique_id') > 0 ? $this->get('unique_id') : null,
            'order' => array($this->get('sort_by') ? $this->get('sort_by') : 'id' => $this->get('sort_dir') ? $this->get('sort_dir') : 'asc'),
        );

        switch ($type) {
            case 'unsent':
                $options['sent'] = false;
                break;
            case 'paid':
                $options['paid'] = true;
                break;
            case 'unpaid':
                $options['paid'] = false;
                break;
            case 'overdue':
                $options['overdue'] = true;
                break;
        }

        $invoices = $this->invoice_m->flexible_get_all($options);

        foreach ($invoices as $key => $invoice) {
            unset($invoice->real_invoice_id);
            unset($invoice->real_invoice_unique_id);
            $invoice->is_overdue = $invoice->overdue;
            unset($invoice->overdue);
            unset($invoice->txn_id);
            unset($invoice->payment_gross);
            unset($invoice->item_name);
            unset($invoice->payment_hash);
            unset($invoice->payment_status);
            unset($invoice->payment_type);
            unset($invoice->payment_date);
            unset($invoice->payer_status);
            unset($invoice->address);
            unset($invoice->language);
            unset($invoice->first_name);
            unset($invoice->last_name);
            unset($invoice->company);
            unset($invoice->email);
            unset($invoice->phone);
            unset($invoice->client_unique_id);
            unset($invoice->formatted_is_paid);
            unset($invoice->client_name);
            unset($invoice->proposal_num);
            unset($invoice->has_tax_reg);
            unset($invoice->part_count);
            unset($invoice->paid_part_count);
            unset($invoice->unpaid_part_count);

            $invoices[$key] = $invoice;
        }

        $count = count($invoices);
        $this->response(array(
            'status' => true,
            'message' => "Found $count {$options['type']}",
            'invoices' => $invoices,
            'count' => $count,
        ), 200);
    }

    /**
     * Show Invoice
     * Requires EITHER unique_id or id
     *
     * @link   /api/1/invoices/show   GET Request
     */
    public function show_get() {
        if (!$this->get('unique_id') and !$this->get('id')) {
            $err_msg = 'No unique_id (or id) was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        // Get the Unique ID
        if ($this->get('unique_id')) {
            $unique_id = $this->get('unique_id');
        } else {
            $unique_id = $this->invoice_m->getUniqueIdById($this->get('id'));
        }

        // Make sure that the invoice is found
        if (!$unique_id OR !$invoice = $this->invoice_m->get($unique_id)) {
            $err_msg = 'This invoice could not be found';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }


        $this->response(array(
            'status' => true,
            'message' => 'Found Invoice #' . $invoice['id'],
            'invoice' => $invoice,
        ), 200);
    }

    function advanced_create_post() {
        if (empty($_POST)) {
            $err_msg = 'No details were provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $post = $this->input->post();
        $post['amount'] = 0; # This has been deprecated but is still around because of compatibility with the old SIMPLE invoices.

        if (!isset($post['is_paid'])) {
            $post['is_paid'] = false;
        }

        $this->load->model("settings/smart_csv_m");

        $needs_rekeying = false;

        if (!isset($post['parts'])) {
            $post['parts'] = [
                [
                    "is_percentage" => 1,
                    "amount" => 100,
                ]
            ];
        }

        foreach ($post['parts'] as $part) {
            if (!isset($part["key"]) || $part["key"] == 0) {
                $needs_rekeying = true;
            }
        }

        if ($needs_rekeying) {
            $i = 1;
            foreach ($post['parts'] as $key => $part) {
                $post['parts'][$key]["key"] = $i;
                $i++;
            }
        }

        foreach ($post['items'] as $item_key => $item) {
            if (!isset($item['tax_ids']) || !is_array($item['tax_ids'])) {
                $item['tax_ids'] = array();
            }

            if (!isset($item['type'])) {
                $item['type'] = 'standard';
            }

            foreach ($item['tax_ids'] as $key => $tax_id) {
                # Correct taxes.
                $this->smart_csv_m->process_tax_including_ids($tax_id);
                $item['tax_ids'][$key] = $tax_id;
            }

            $post['items'][$item_key] = $item;
        }

        $files = [];

        if (isset($post['files'])) {
            foreach ($post['files'] as $file) {
                $filename = $file['filename'];
                $contents = base64_decode($file['contents']);
                $files[$filename] = $contents;
            }

            unset($post['files']);
        }

        if ($unique_id = $this->invoice_m->insert($post, $files)) {
            $invoice_number = $this->invoice_m->getInvoiceNumberByUniqueId($unique_id);

            $this->response([
                'status' => true,
                'unique_id' => $unique_id,
                'message' => sprintf('Invoice #%s has been created.', $invoice_number),
            ], 200);
        } else {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }
    }

    /**
     * New Invoice
     *
     * @link   /api/1/invoices/new   POST Request
     */
    public function new_post() {
        if (empty($_POST)) {
            $err_msg = 'No details were provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $post = $this->input->post();
        $items = array();

        if ($this->post('project_id')) {
            $this->load->model('projects/project_m');
            $this->load->model('projects/project_task_m');

            if (!$project = $this->project_m->get_project_by_id($this->post('project_id'))) {
                $err_msg = 'This project could not be found.';
                $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
            }

            // Dan likes weird returns
            $project = $project->row();
            $tasks = $this->project_task_m->get_tasks_by_project($project->id);

            if ($tasks && is_array($tasks)) {
                foreach ($tasks as $task) {
                    if (!isset($task['name'], $task['tracked_hours'], $task['rate'])) {
                        continue;
                    }

                    $items[] = array(
                        'name' => $task['name'],
                        'description' => isset($task['notes']) ? $task['notes'] : '',
                        'qty' => $task['tracked_hours'],
                        'rate' => $task['rate'],
                        'tax_id' => 0,
                        'total' => round($task['tracked_hours'] * $task['rate'], 2),
                    );
                }
            } else {
                $err_msg = 'This project has no tasks, so no invoice can be made.';
                $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
            }
        }

        if ($post_items = $this->input->post('items')) {
            if (!is_array($post_items)) {
                $err_msg = 'Items must be an array';
                $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
            }

            foreach ($post_items as $i => $item) {
                if (!isset($item['name'], $item['rate'], $item['quantity'])) {
                    // Get the keys they are missing
                    $item_required = array_flip(array('name', 'rate', 'quantity'));
                    $diff = array_flip(array_diff_key($item_required, $item));

                    // Sort is here so that json_encode will make it a numeric array rather than object
                    sort($diff);

                    $err_msg = 'Line Item [' . $i . '] is missing the following keys: ' . json_encode($diff);
                    $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
                }

                $items[] = array(
                    'name' => $item['name'],
                    'description' => isset($item['description']) ? $item['description'] : '',
                    'qty' => $item['quantity'],
                    'rate' => $item['rate'],
                    'tax_id' => isset($item['tax_id']) ? $item['tax_id'] : 0,
                    'total' => round($item['quantity'] * $item['rate'], 2),
                );
            }
        }

        // So we aren't case sensitive on the invoice type
        if (isset($post['type'])) {
            $post['type'] = strtoupper($post['type']);
        }

        $input = array(
            'client_id' => $this->post('client_id'),
            'type' => $this->post('type'),
            'amount' => $this->post('amount'),
            'description' => $this->post('description'),
            'notes' => $this->post('notes'),
            'is_paid' => $this->post('is_paid'),
            'due_date' => $this->post('due_date'),
            'is_recurring' => $this->post('is_recurring'),
            'frequency' => $this->post('frequency'),
            'auto_send' => $this->post('auto_send'),
            'currency' => $this->post('currency'),
            'items' => $items,
        );

        if ($unique_id = $this->invoice_m->insert($input)) {
            $this->response(array('status' => true, 'unique_id' => $unique_id, 'message' => sprintf('Invoice #%s has been created.', $unique_id)), 200);
        } else {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }
    }

    /**
     * Edit Invoice
     * The original documented endpoint.
     *
     * @link   /api/1/invoices/edit   POST Request
     */
    public function edit_post() {
        if (!$unique_id = $this->post('unique_id')) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $invoice = $this->invoice_m->get($unique_id);

        if (empty($invoice)) {
            $err_msg = 'This invoice does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        if ($this->invoice_m->update($unique_id, $this->input->post())) {
            $this->response(array('status' => true, 'message' => sprintf('Project #%d has been updated.', $unique_id)), 200);
        } else {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }
    }

    /**
     * Update Invoice
     *
     * @deprecated This should stay for backward compatibility
     * @link       /api/1/invoices/update   POST Request
     */
    public function update_post() {
        $this->edit_post();
    }

    /**
     * Send Invoice
     *
     * @link   /api/1/invoices/send   POST Request
     */
    public function send_post() {
        if (!$this->post('unique_id')) {
            $err_msg = 'No Unique ID was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $unique_id = $this->post('unique_id');
        $invoice = $this->invoice_m->get_by_unique_id($unique_id);

        if (!$invoice) {
            $err_msg = 'The invoice for which you are trying to send an email doesn\'t exist.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        if ($this->invoice_m->sendNotificationEmail($unique_id)) {
            $this->response(array(
                'status' => true,
                'message' => "Sent an email of Invoice #{$invoice['invoice_number']} to {$invoice['email']}.",
            ), 200);
        } else {
            $err_msg = 'An unknown error occurred while trying to send the email for Invoice #' . $invoice['invoice_number'] . '.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }
    }

    /**
     * Add a payment for an invoice.
     *
     * @link   /api/1/invoices/add_payment   POST Request
     */
    public function add_payment_post() {
        if (!$this->post('unique_id')) {
            $err_msg = 'No Unique ID was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $unique_id = $this->post('unique_id');
        $invoice = $this->invoice_m->get_by_unique_id($unique_id);

        if (!$invoice) {
            $err_msg = 'The invoice for which you are trying to add a payment doesn\'t exist.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $gateway = $this->post('gateway');
        $payment_datetime = $this->post('payment_datetime');
        $amount = $this->post('amount');
        $transaction_id = $this->post('transaction_id');
        $transaction_fee = $this->post('transaction_fee');
        $send_notification_email = $this->post('send_notification_email');

        if (empty($gateway)) {
            $err_msg = 'You need to specify the payment gateway that was used for this payment.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        if (empty($amount)) {
            $err_msg = 'You need to specify the amount that was paid.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        if ($amount <= 0) {
            $err_msg = 'The amount paid has to be a positive number.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $payment_datetime = $payment_datetime ? carbon($payment_datetime)->timestamp : time();
        $transaction_id = $transaction_id ? $transaction_id : "";
        $transaction_fee = $transaction_fee ? $transaction_fee : 0;
        $send_notification_email = (bool) $send_notification_email;

        $this->ppm->addPayment($unique_id, $amount, $payment_datetime, $gateway, $transaction_id, $transaction_fee, $send_notification_email);

        $this->response(array(
            'status' => true,
            'message' => "Added a payment of " . Currency::format($amount, $invoice["currency_code"]) . " to Invoice #{$invoice['invoice_number']}.",
        ), 200);
    }

    /**
     * Set the payment details of an item in the Payment Schedule.
     *
     * @link   /api/1/invoices/set_payment_details   POST Request
     */
    public function set_payment_details_post() {
        if (!$this->post('unique_id')) {
            $err_msg = 'No Unique ID was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $unique_id = $this->post('unique_id');
        $invoice = $this->invoice_m->get_by_unique_id($unique_id);

        if (!$invoice) {
            $err_msg = 'The invoice for which you are trying to set payment details doesn\'t exist.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $gateway = $this->post('gateway');
        $payment_i = $this->post('payment_i');
        $payment_datetime = $this->post('payment_datetime');
        $payment_status = $this->post('payment_status');
        $transaction_id = $this->post('transaction_id');
        $transaction_fee = $this->post('transaction_fee');
        $send_notification_email = $this->post('send_notification_email');

        if (empty($gateway)) {
            $err_msg = 'You need to specify the payment gateway that was used for this payment.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $payment_datetime = $payment_datetime ? carbon($payment_datetime)->timestamp : time();
        $transaction_id = $transaction_id ? $transaction_id : "";
        $payment_status = $payment_status ? $payment_status : "Completed";
        $transaction_fee = $transaction_fee ? $transaction_fee : 0;
        $send_notification_email = (bool) $send_notification_email;

        $this->ppm->setPartialPaymentDetails($unique_id, $payment_i, $payment_datetime, $gateway, $payment_status, $transaction_id, $transaction_fee, $send_notification_email);

        $this->response(array(
            'status' => true,
            'message' => "Set the payment details of Payment #{$payment_i} of Invoice #{$invoice['invoice_number']}.",
        ), 200);
    }

    /**
     * Delete Invoice
     *
     * @link   /api/1/invoices/delete   POST Request
     */
    public function delete_post($unique_id = null) {
        if (!$this->post('unique_id') and !$this->post('id')) {
            $err_msg = 'No unique_id (or id) was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        // Get the Unique ID
        if ($this->post('unique_id')) {
            $unique_id = $this->post('unique_id');
        } else {
            $unique_id = $this->invoice_m->getUniqueIdById($this->post('id'));
        }

        // Make sure that the invoice is found
        if (!$unique_id OR !$invoice = $this->invoice_m->get($unique_id)) {
            $err_msg = 'This invoice does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        // Delete the Invoice!
        $this->invoice_m->delete($unique_id);
        $this->response(array('status' => true, 'message' => 'Invoice #' . $unique_id . ' has been deleted.'), 200);
    }

}