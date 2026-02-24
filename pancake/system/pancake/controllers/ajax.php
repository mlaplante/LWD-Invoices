<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright	Copyright (c) 2010, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 1.0
 */
// ------------------------------------------------------------------------

/**
 * The javascript controller
 *
 * @subpackage	Controllers
 * @category	Javascript
 */
class Ajax extends Pancake_Controller {

    public function convert_currency($to = null, $amount = 1) {
        if (!empty($to)) {
            echo Currency::convert($amount, Currency::code(), $to);
        }
    }

    public function url_title() {
        $this->load->helper('text');

        $slug = trim(url_title($this->input->post('title'), 'dash', TRUE), '-');

        $this->output->set_output($slug);
    }

    public function get_payment_details($invoice_unique_id, $key, $is_add_payment = false) {
        if (logged_in() and ! empty($invoice_unique_id)) {
            require_once APPPATH . 'modules/gateways/gateway.php';
            $this->load->model('invoices/invoice_m');

            $invoice = $this->invoice_m->flexible_get_all(array('unique_id' => $invoice_unique_id, 'return_object' => false, 'get_single' => true));

            if (!$invoice) {
                die("Access denied.");
            }

            if (!$is_add_payment) {
                $this->load->model('invoices/partial_payments_m', 'ppm');
                $part = $this->ppm->getPartialPaymentDetails($key, $invoice_unique_id, true);

                if (empty($part)) {
                    die("Access denied.");
                }

                $part['key'] = $key;
            } else {
                $part = array(
                    'unique_id' => '',
                    'gateway' => '',
                    'date' => format_date(time()),
                    'tid' => '',
                    'fee' => '0',
                    'status' => '',
                    'amount' => '',
                    'currency' => Currency::symbol(Currency::code($invoice['currency_id']))
                );
            }
            $part['client_id'] = $invoice['client_id'];
            $part['is_add_payment'] = $is_add_payment;
            switch_theme(true);

            $part['gateways'] = Gateway::get_enabled_gateway_select_array(true, $part['client_id']);

            $part['submit_url'] = site_url("ajax/" . ($is_add_payment ? 'add_payment' : 'set_payment_details') . "/$invoice_unique_id/$key");
            $this->load->view('invoices/partial_payment_details', $part);
        }
    }

    public function refresh_tracked_hours($task_id) {
        $this->load->model('projects/project_m');
        $this->load->model('projects/project_task_m');
        $this->load->model('projects/project_time_m');
        print $this->project_task_m->get_processed_task_hours($task_id);
        die;
    }

    public function hide_notification($notification_id) {
        if (logged_in()) {
            hide_notification($notification_id);
        }
    }

    public function mark_as_sent($module, $unique_id) {
        $this->load->model('invoices/invoice_m');
        $this->load->model('proposals/proposals_m');

        if ($module == "proposals") {
            $client_id = get_client("proposals", $unique_id);
            $id = $this->proposals_m->getIdByUniqueId($unique_id);
            $can_send = can('send', $client_id, "proposals", $id);
        } else {
            $client_id = get_client("invoices", $unique_id);
            $permissions_module = $this->invoice_m->getPermissionsItemTypeByUniqueId($unique_id);
            $id = $this->invoice_m->getIdByUniqueId($unique_id);
            $can_send = can('send', $client_id, $permissions_module, $id);
        }

        if (logged_in() and $can_send) {
            require_once APPPATH . 'modules/gateways/gateway.php';

            if ($module == "proposals") {
                $this->proposals_m->mark_as_sent($unique_id);
            } else {
                $this->invoice_m->mark_as_sent($unique_id);
            }
            exit('WORKED');
        } else {
            exit('ACCESS_DENIED');
        }
    }

    public function add_payment($unique_invoice_id) {
        require_once APPPATH . 'modules/gateways/gateway.php';
        $this->load->model('invoices/invoice_m');
        $this->load->model('invoices/partial_payments_m', 'ppm');

        $gateway = $_POST['gateway'];
        $date = $_POST['date'];
        $tid = $_POST['transaction_id'];
        $fee = $_POST['fee'];
        $amount = $_POST['amount'];
        $send_notification_email = (isset($_POST['send_payment_notification']) and $_POST['send_payment_notification'] !== "false");

        if (!$this->invoice_m->exists(["unique_id" => $unique_invoice_id])) {
            throw new Exception("Trying to add a payment for an invoice that does not exist!");
        }

        if (logged_in() and can('update', $this->invoice_m->getClientIdByUniqueId($unique_invoice_id), $this->invoice_m->getPermissionsItemTypeByUniqueId($unique_invoice_id), $this->invoice_m->getIdByUniqueId($unique_invoice_id))) {
            $this->ppm->addPayment($unique_invoice_id, $amount, $date, $gateway, $tid, $fee, $send_notification_email);
        }
        exit('WORKED');
    }

    public function set_payment_details($unique_invoice_id, $key) {
        require_once APPPATH . 'modules/gateways/gateway.php';
        $this->load->model('invoices/invoice_m');
        $this->load->model('invoices/partial_payments_m', 'ppm');

        if (isset($_POST['payment_status'])) {
            $status = $_POST['payment_status'];
            $gateway = $_POST['gateway'];
            $date = $_POST['date'];
            $tid = $_POST['transaction_id'];
            $fee = $_POST['fee'];
        } elseif (isset($_POST['payment-status'])) {
            $status = $_POST['payment-status'];
            $gateway = $_POST['payment-gateway'];
            $date = $_POST['payment-date'];
            $tid = $_POST['payment-tid'];
            $fee = $_POST['transaction-fee'];
        } else {
            throw new Exception("No valid payment information was found.");
        }

        $send_notification_email = (isset($_POST['send_payment_notification']) and $_POST['send_payment_notification'] !== "false");

        if (!$this->invoice_m->exists(["unique_id" => $unique_invoice_id])) {
            throw new Exception("Trying to add a payment for an invoice that does not exist!");
        }

        if (!empty($gateway) && !empty($date) && empty($status)) {
            $status = "Completed";
        }

        if (logged_in() and can('update', $this->invoice_m->getClientIdByUniqueId($unique_invoice_id), $this->invoice_m->getPermissionsItemTypeByUniqueId($unique_invoice_id), $this->invoice_m->getIdByUniqueId($unique_invoice_id))) {
            require_once APPPATH . 'modules/gateways/gateway.php';
            $this->load->model('invoices/partial_payments_m', 'ppm');
            $this->ppm->setPartialPaymentDetails($unique_invoice_id, $key, $date, $gateway, $status, $tid, $fee, $send_notification_email);

            if ($status == 'Completed') {
                $this->load->model('tickets/ticket_m');
                $invoice = $this->invoice_m->get_by_unique_id($unique_invoice_id);

                if ($this->ticket_m->has_invoice($invoice['id'])) {
                    $ticket = $this->ticket_m->get_by('tickets.invoice_id', $invoice['id']);

                    $this->ticket_m->update($ticket->id, array('is_paid' => 1), true);
                }
            }
        }

        exit('WORKED');
    }

    public function save_proposal($unique_id) {
        $this->load->model('proposals/proposals_m');
        $this->proposals_m->get_estimates = false;

        if (isset($_POST['sections'])) {
            foreach ($_POST['sections'] as $key => $section) {
                $_POST['sections'][$key]['page_key'] = (int) $_POST['sections'][$key]['page_key'];
                $_POST['sections'][$key]['proposal_id'] = (int) $_POST['sections'][$key]['proposal_id'];
                $_POST['sections'][$key]['key'] = (int) $_POST['sections'][$key]['key'];
                $_POST['sections'][$key]['parent_id'] = (int) $_POST['sections'][$key]['parent_id'];
                $_POST['sections'][$key]['page_key'] = (int) $_POST['sections'][$key]['page_key'];
            }
        }

        if (logged_in() and can('update', $this->proposals_m->getClientIdByUniqueId($unique_id), 'proposals', $this->proposals_m->getIdByUniqueId($unique_id))) {
            $id = $this->proposals_m->getIdByUniqueId($unique_id);
            $success = $this->proposals_m->edit($id, $_POST);

            if ($success) {
                $data = $this->proposals_m->getByUniqueId($unique_id, false);

                $sections = array();

                foreach ($data['pages'] as $page_key => $page) {
                    foreach ($page['sections'] as $section) {
                        $sections[] = $section;
                    }
                }

                unset($data['pages']);
                $data['sections'] = $sections;

                echo json_encode($data);
            } else {
                echo "UHOH";
            }
        } else {
            print "NOT_LOGGED_IN";
            die;
        }
    }

    public function get_notifications() {
        $this->load->model('notification_m');
    }

    function image_upload() {
        $type = strtolower($_FILES['file']['type']);
        if (substr($type, 0, strlen("image/")) == "image/") {
            $result = pancake_upload($_FILES['file'], null, 'redactor');
            if (is_array($result)) {
                $result = reset($result);
                echo stripslashes(json_encode(array('filelink' => $result['url'])));
            }
        }
    }

    function file_upload() {
        $result = pancake_upload($_FILES['file'], null, 'redactor');
        if (is_array($result)) {
            $result = reset($result);
            echo stripslashes(json_encode(array('filelink' => $result['url'], 'filename' => $_FILES['file']['name'])));
        }
    }

    function image_library() {
        if (logged_in()) {
            $entries = array();

            $result = \Pancake\Filesystem\Filesystem::listContents("redactor");

            $this->load->helper('file');
            foreach ($result as $file) {
                if (substr(get_mime_by_extension($file["basename"]), 0, strlen("image/")) == "image/") {
                    $entries[] = array(
                        "thumb" => Pancake\Filesystem\Filesystem::url($file["path"]),
                        "image" => Pancake\Filesystem\Filesystem::url($file["path"]),
                    );
                }
            }

            echo stripslashes(json_encode($entries));
        }
    }

    public function search_existing() {
        if (is_admin()) {
            switch ($_POST['import_type']) {
                case 'currencies':
                    $this->load->model('settings/currency_m');
                    $result = $this->currency_m->search($_POST['query']);
                    echo json_encode($result);
                    break;
                case 'gateways':
                    require_once APPPATH . 'modules/gateways/gateway.php';
                    $result = Gateway::search($_POST['query']);
                    echo json_encode($result);
                    break;
                case 'clients':
                    $this->load->model('clients/clients_m');
                    $result = $this->clients_m->search($_POST['query']);
                    echo json_encode($result);
                    break;
                case 'suppliers':
                    $this->load->model('expenses/expenses_suppliers_m');
                    $result = $this->expenses_suppliers_m->search($_POST['query']);
                    echo json_encode($result);
                    break;
                case 'categories':
                    $this->load->model('expenses/expenses_categories_m');
                    $result = $this->expenses_categories_m->search($_POST['query']);
                    echo json_encode($result);
                    break;
                case 'users':
                    $this->load->model('users/user_m');
                    $result = $this->user_m->search($_POST['query']);
                    echo json_encode($result);
                    break;
                case 'tasks':
                    $this->load->model('projects/project_task_m');
                    $this->load->model('clients/clients_m');
                    $this->load->model('settings/smart_csv_m');
                    if (isset($_POST['extra_data']['project_id'])) {
                        $this->smart_csv_m->process_existing_record($_POST['extra_data']['project_id'], 'project_m');
                    }

                    if (isset($_POST['extra_data']['client_id'])) {
                        $this->smart_csv_m->process_existing_record($_POST['extra_data']['client_id'], 'clients_m');
                    }

                    $result = $this->project_task_m->search($_POST['query'], isset($_POST['extra_data']['client_id']) ? $_POST['extra_data']['client_id'] : null, isset($_POST['extra_data']['project_id']) ? $_POST['extra_data']['project_id'] : null);
                    echo json_encode($result);
                    break;
                case 'projects':
                    $this->load->model('projects/project_m');
                    $result = $this->project_m->search($_POST['query']);
                    echo json_encode($result);
                    break;
                case 'milestones':
                    $this->load->model('projects/project_milestone_m');
                    $this->load->model('settings/smart_csv_m');
                    $this->smart_csv_m->process_existing_record($_POST['extra_data']['project'], 'project_m');
                    $result = $this->project_milestone_m->search($_POST['query'], $_POST['extra_data']['project']);
                    echo json_encode($result);
                    break;
                case 'task_statuses':
                    $this->load->model('projects/project_task_statuses_m');
                    $result = $this->project_task_statuses_m->search($_POST['query']);
                    echo json_encode($result);
                    break;
                case 'taxes':
                    $this->load->model('settings/tax_m');
                    $result = $this->tax_m->search($_POST['query']);
                    echo json_encode($result);
                    break;
            }
        }
    }

    public function save_premade_section() {
        $this->load->model('proposals/proposals_m');
        if (is_admin()) {
            if ($_POST['title'] != '' and $_POST['contents'] != '') {
                $this->proposals_m->createPremadeSection($_POST['title'], $_POST['subtitle'], $_POST['contents']);
            }
        }
        exit('WORKED');
    }

    public function get_estimates($client_id) {
        if (logged_in()) {
            $this->load->model('invoices/invoice_m');
            switch_theme(true);
            $this->load->view('proposals/get_estimates', array(
                'client_id' => $client_id,
                'estimates' => $this->invoice_m->getEstimatesForDropdown($client_id)
            ));
        }
    }

    public function delete_premade_section($section_id) {
        if (is_admin()) {
            $this->load->model('proposals/proposals_m');
            $this->load->model('invoices/invoice_m');
            $result = $this->proposals_m->deleteSection($section_id);
            exit($result ? 'WORKED' : 'ERROR');
        }
    }

    public function get_premade_sections() {
        if (logged_in()) {
            $this->load->model('proposals/proposals_m');
            $this->load->model('invoices/invoice_m');
            switch_theme(true);
            $this->load->view('proposals/get_premade_sections', array('sections' => $this->proposals_m->getPremadeSections()));
        }
    }

    public function set_estimate($unique_id, $status = null) {
        $this->load->model('invoices/invoice_m');

        if ($status == 'accept') {
            $this->invoice_m->acceptEstimate($unique_id);
            print "ACCEPTED";
        } elseif ($status == 'reject') {
            $this->invoice_m->rejectEstimate($unique_id);
            print "REJECTED";
        } else {
            $this->invoice_m->unanswerEstimate($unique_id);
            print "UNANSWERED";
        }
        die;
    }

    public function set_proposal($unique_id, $status = null) {
        $this->load->model('proposals/proposals_m');

        if ($status == 'accept') {
            $this->proposals_m->accept($unique_id);
            print "ACCEPTED";
        } elseif ($status == 'reject') {
            $this->proposals_m->reject($unique_id);
            print "REJECTED";
        } elseif ($status == 'viewable') {
            if (logged_in() and can('update', $this->proposals_m->getClientIdByUniqueId($unique_id), 'proposals', $this->proposals_m->getIdByUniqueId($unique_id))) {
                $this->proposals_m->setViewable($unique_id, 1);
            }
        } elseif ($status == 'not_viewable') {
            if (logged_in() and can('update', $this->proposals_m->getClientIdByUniqueId($unique_id), 'proposals', $this->proposals_m->getIdByUniqueId($unique_id))) {
                $this->proposals_m->setViewable($unique_id, 0);
            }
        } else {
            $this->proposals_m->unanswer($unique_id);
            print "UNANSWERED";
        }
        die;
    }

    public function save_client_call() {
        $this->load->model('clients/clients_m');
        $this->load->model('clients/contact_m');

        can('update', $this->input->post('client_id'), 'clients', $this->input->post('client_id')) or access_denied();

        if (!($client = $this->clients_m->get($this->input->post('client_id')))) {
            set_status_header(404);
            exit(json_encode(array('error' => __('clients:does_not_exist'))));
        }

        if (!logged_in()) {
            set_status_header(403);
            exit(json_encode(array('error' => __('clients:does_not_exist'))));
        }

        if ($this->contact_m->insert(array(
                    'client_id' => $client->id,
                    'user_id' => (int) $this->current_user->id,
                    'method' => 'phone',
                    'duration' => 0,
                    'contact' => $this->input->post('phone_type') == 'phone' ? $client->phone : $client->mobile,
                    'subject' => $this->input->post('subject'),
                    'content' => $this->input->post('content'),
                    'sent_date' => now()->timestamp,
                ))) {
            exit;
        } else {
            set_status_header(400);
            exit(json_encode(array('error' => $this->form_validation->error_string())));
        }
    }

}

/* End of file ajax.php */
