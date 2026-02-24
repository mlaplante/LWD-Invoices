<?php

use Pancake\Navigation;

defined('BASEPATH') OR exit('No direct script access allowed');

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
 * The admin controller for invoices
 *
 * @subpackage    Controllers
 * @category      Dashboard
 */
class Admin extends Admin_Controller {
    protected $section = 'invoices';

    /**
     * Auto-completion for invoice_m
     *
     * @var Invoice_m
     */
    public $invoice_m;

    /**
     * Load in the payments model
     *
     * @access    public
     * @return    void
     */
    public function __construct() {
        parent::__construct();
        $this->load->model('invoice_m');
        $this->load->model('partial_payments_m', 'ppm');
        $this->load->model('items/item_m');
        require_once APPPATH . 'modules/gateways/gateway.php';
    }

    // ------------------------------------------------------------------------

    /**
     * Creates a new invoice
     *
     * @access    public
     * @return    void
     */
    public function create($project_id = null, $client_id = 0, $type = null) {

        if ($type === null) {
            if (isset($_POST['type'])) {
                $type = $_POST['type'];
            } elseif (($this->template->module == 'invoices' and substr($this->uri->uri_string(), 6, strlen('estimates')) == 'estimates') or ($this->template->module == 'estimates')) {
                $type = "ESTIMATE";
            } elseif (($this->template->module == 'invoices' and substr($this->uri->uri_string(), 6, strlen('credit_notes')) == 'credit_notes') or ($this->template->module == 'credit_notes')) {
                $type = "CREDIT_NOTE";
            } else {
                $type = "DETAILED";
            }
        }

        $type = strtoupper($type);
        if (!in_array($type, array("ESTIMATE", "CREDIT_NOTE"))) {
            $type = "DETAILED";
        }

        can_for_any_client('create', 'estimates_plus_invoices') or access_denied();

        if (isset($_POST['project_id'])) {
            # Override URL project ID if the user changed it.
            $project_id = $_POST['project_id'];
        }

        if ($project_id == 'iframe') {
            $iframe = true;
            $project_id = null;
        } elseif ($project_id == 'client') {
            $iframe = false;
            $project_id = null;
        } else {
            $iframe = false;
        }

        // Passed in the URL
        if ($this->input->get('client')) {
            $client_id = $this->input->get('client');
        } else if (isset($_POST['client_id'])) {
            $client_id = $_POST['client_id'];
        } else if ($project_id > 0) {
            $this->load->model('projects/project_m');
            $this->load->model('projects/project_task_m');
            $this->load->model('projects/project_time_m');

            $project = $this->project_m->get_project_by_id($project_id)->row();
            $client_id = $project->client_id;
        }

        $this->load->model("clients/clients_taxes_m");
        $this->load->model('projects/project_expense_m');

        $this->template->client_id = (int) $client_id;

        $items = array();

        // Prepopulate items based on Project ID
        if ($project_id > 0 and !$this->input->post('invoice_item')) {
            $this->template->project = $project;
            $this->template->client_id = (int)$project->client_id;
            $form_data = $this->_get_form_data();
            $unbilled_time_entries = isset($form_data["time_entries_for_billing"][$project->id]) ? $form_data["time_entries_for_billing"][$project->id] : array('tasks' => array(), 'milestones' => array());
            $unbilled_expenses = isset($form_data["expenses_for_billing"][$project->id]) ? $form_data["expenses_for_billing"][$project->id] : array();
            $unbilled_flat_rates = isset($form_data["flat_rates_for_billing"][$project->id]) ? $form_data["flat_rates_for_billing"][$project->id] : array();

            foreach ($unbilled_flat_rates as $task_id => $task) {
                $items[] = array(
                    'name' => $task['name'],
                    'description' => $task['notes'], // Is done by JS.
                    'item_type_table' => "project_tasks",
                    'item_time_entries' => "",
                    'item_type_id' => $task['id'],
                    'qty' => 1,
                    'rate' => $task['rate'],
                    'period' => null,
                    'discount' => 0,
                    'discount_is_percentage' => 0,
                    'type' => 'flat_rate',
                    'tax_ids' => Settings::get_default_tax_ids(),
                    'total' => $task['rate'],
                );
            }

            foreach ($unbilled_expenses as $expense) {
                $items[] = array(
                    'name' => $expense['name'],
                    'description' => $expense['description'],
                    'item_type_table' => 'project_expenses',
                    'item_type_id' => $expense['id'],
                    'qty' => $expense['qty'],
                    'period' => null,
                    'rate' => $expense['rate'],
                    'discount' => 0,
                    'discount_is_percentage' => 0,
                    'type' => 'expense',
                    'tax_ids' => Settings::get_default_tax_ids(), // Tax ID is not implemented for expenses, so use the default taxes for now.
                    'total' => 0, // Is calculated by JS. It's better to not repeat code.
                );
            }

            if (!$project->is_flat_rate) {
                $has_flat_rates = false;
                foreach ($unbilled_time_entries["tasks"] as $task) {
                    if ($task['is_flat_rate']) {
                        $has_flat_rates = true;
                    }
                }

                $split = Settings::get('split_line_items_by');

                # Enforce per-task breakdown if there are flat rates.
                if ($has_flat_rates) {
                    $split = "project_tasks";
                }

                foreach ($unbilled_time_entries[$split == 'project_milestones' ? 'milestones' : 'tasks'] as $task) {
                    // task: id, project_id, milestone_id, name, rate, notes
                    // milestone: id, name, description, project_id, time_entries

                    if ($split == 'project_times') {
                        foreach ($task['time_entries'] as $time_entry) {
                            $items[] = array(
                                'name' => $task['name'],
                                'description' => '', // Is done by JS.
                                'item_type_table' => 'project_tasks',
                                'item_type_id' => $task['id'],
                                'period' => null,
                                'item_time_entries' => $time_entry['id'],
                                'qty' => 0, // Is calculated by JS. It's better to not repeat code.
                                'rate' => 0, // Is calculated by JS. It's better to not repeat code.
                                'discount' => 0,
                                'discount_is_percentage' => 0,
                                'type' => 'time_entry',
                                'tax_ids' => Settings::get_default_tax_ids(),
                                'total' => 0, // Is calculated by JS. It's better to not repeat code.
                            );
                        }
                    } else {

                        $new_time_entries = array();

                        foreach ($task['time_entries'] as $time_entry) {
                            $new_time_entries[] = $time_entry['id'];
                        }

                        $new_time_entries = implode(',', $new_time_entries);

                        if (!$task['is_flat_rate']) {
                            $items[] = array(
                                'name' => $task['name'],
                                'description' => '', // Is done by JS.
                                'item_type_table' => $split,
                                'item_time_entries' => $new_time_entries,
                                'item_type_id' => $task['id'],
                                'period' => null,
                                'qty' => 0, // Is calculated by JS. It's better to not repeat code.
                                'rate' => 0, // Is calculated by JS. It's better to not repeat code.
                                'discount' => 0,
                                'discount_is_percentage' => 0,
                                'type' => 'time_entry',
                                'tax_ids' => Settings::get_default_tax_ids(),
                                'total' => 0, // Is calculated by JS. It's better to not repeat code.
                            );
                        }
                    }

                }
            } else {
                $items[] = array(
                    'name' => $project->name,
                    'description' => $project->description, // Is done by JS.
                    'item_type_table' => "",
                    'item_time_entries' => "",
                    'item_type_id' => "",
                    'period' => null,
                    'qty' => 1, // Is calculated by JS. It's better to not repeat code.
                    'rate' => $project->rate, // Is calculated by JS. It's better to not repeat code.
                    'discount' => 0,
                    'discount_is_percentage' => 0,
                    'type' => 'flat_rate',
                    'tax_ids' => Settings::get_default_tax_ids(),
                    'total' => $project->rate,
                );
            }
        } else if ($post_items = $this->input->post('invoice_item')) {

            for ($i = 0; $i < count($post_items['name']); $i++) {
                $item_type_id = explode('_', $post_items['item_type_id'][$i]);
                if ($item_type_id[0] == 'MILESTONE') {
                    $item_type_id[0] = 'project_milestones';
                } elseif ($item_type_id[0] == 'TASK') {
                    $item_type_id[0] = 'project_tasks';
                } else {
                    $item_type_id[0] = 'project_expenses';
                }

                if (!isset($item_type_id[1])) {
                    $item_type_id[1] = 0;
                }

                $discount = isset($post_items['discount'][$i]) ? $post_items['discount'][$i] : 0;
                if (strlen($discount) == 0) {
                    $discount = 0;
                }

                $items[] = array(
                    'name' => $post_items['name'][$i],
                    'description' => $post_items['description'][$i],
                    'item_type_table' => $item_type_id[0],
                    'item_type_id' => $item_type_id[1],
                    'qty' => isset($post_items['qty'][$i]) ? $post_items['qty'][$i] : 0,
                    'rate' => $post_items['rate'][$i],
                    'period' => isset($post_items['period'][$i]) ? $post_items['period'][$i] : 0,
                    'tax_ids' => isset($post_items['tax_id'][$i]) ? $post_items['tax_id'][$i] : array(),
                    'discount' => $discount,
                    'discount_is_percentage' => isset($post_items['discount_is_percentage'][$i]) ? $post_items['discount_is_percentage'][$i] : 0,
                    'total' => isset($post_items['cost'][$i]) ? $post_items['cost'][$i] : 0,
                );
            }
        }

        if (empty($items)) {
            $items[] = array(
                'name' => '',
                'description' => '',
                'qty' => 1,
                'rate' => '0.00',
                'period' => '1',
                'discount' => 0,
                'discount_is_percentage' => 0,
                'tax_ids' => Settings::get_default_tax_ids(),
                'total' => 0,
            );
        }

        $this->template->items = $items;

        $this->template->currencies = Settings::currencies_dropdown();
        $this->template->client_ids_with_tokens = Gateway::get_clients_with_valid_tokens();

        $this->load->model('clients/clients_m');

        $this->template->iframe = $iframe;

        // Build the client dropdown array for the form
        $this->template->clients_dropdown = client_dropdown('estimates_plus_invoices', 'create_plus_update_and_generate');

        # This is remapped so as to not break third-party themes.
        $projects = [];
        foreach ($this->project_m->get_dropdown() as $id => $name) {
            $projects[$id] = new stdClass;
            $projects[$id]->id = $id;
            $projects[$id]->name = $name;
        }

        $this->template->projects = $projects;

        $this->template->gateways = Gateway::get_enabled_gateways();

        $default_invoice_notes = $this->business_identities_m->getAllBusinesses();
        $default_invoice_notes = array_map(function ($row) {
            return $row['default_invoice_notes'];
        }, $default_invoice_notes);
        $this->template->default_invoice_notes = $default_invoice_notes;

        if ($_POST) {
            $postBuffer = $_POST;

            can('create', $postBuffer['client_id'], $postBuffer['type'] == 'ESTIMATE' ? 'estimates' : 'invoices') or access_denied();

            $buffer = isset($_POST['gateways']) ? $_POST['gateways'] : array();
            unset($postBuffer['gateways']);
            if ($result = $this->invoice_m->insert($postBuffer, @$_FILES['invoice_files'])) {
                $id = $this->invoice_m->getIdByUniqueId($result);
                require_once APPPATH . 'modules/gateways/gateway.php';
                Gateway::processItemInput('INVOICE', $id, $buffer);

                if ($_POST['type'] == 'ESTIMATE') {
                    $notice = __('estimates:added');
                } else if ($_POST['type'] == 'CREDIT_NOTE') {
                    $notice = __('credit_notes:added');
                } else {
                    $notice = __('invoices:added');
                }

                $this->session->set_flashdata('success', $notice);

                if (!$iframe) {
                    redirect('admin/invoices/created/' . $result);
                } else {
                    $this->template->id = $id;
                    $this->_set_title($type);
                    return $this->template->build('close_facebox');
                }
            }
        }

        $this->_set_title($type);
        $this->template->type = $type;
        $this->template->files = array();
        $this->template->invoice_number = $this->invoice_m->_generate_invoice_number(null, $type, null, $client_id);
        $this->template->unique_id = $this->invoice_m->_generate_unique_id();
        $this->template->is_edit = false;
        $this->template->build('form');
    }

    protected function _get_form_data($unique_id = null) {
        $this->load->model("clients/clients_m");
        $this->load->model("clients/clients_taxes_m");
        $this->load->model('projects/project_expense_m');

        if ($unique_id) {
            $invoice_row_ids = $this->invoice_m->getRowIdsByUniqueId($unique_id);
        } else {
            $invoice_row_ids = [];
        }

        $data = [
            "time_entries_for_billing" => $this->project_task_m->get_for_billing($invoice_row_ids),
            "flat_rates_for_billing" => $this->project_task_m->get_flat_rates_for_billing($invoice_row_ids),
            "expenses_for_billing" => $this->project_expense_m->get_for_billing($invoice_row_ids),
            "projects_per_client" => $this->project_m->get_dropdown_per_client(),
            "unique_id" => $unique_id,
        ];

        $buffer = array();
        foreach ($data["projects_per_client"] as $buffer_client_id => $projects) {
            if (!isset($buffer[$buffer_client_id])) {
                $buffer[$buffer_client_id] = array();
            }

            $buffer[$buffer_client_id] = array_keys($projects);
        }

        $data["project_order_per_client"] = $buffer;


        $default_invoice_notes = $this->business_identities_m->getAllBusinesses();
        $default_invoice_notes = array_map(function ($row) {
            return $row['default_invoice_notes'];
        }, $default_invoice_notes);
        $data["default_invoice_notes"] = $default_invoice_notes;
        return $data;
    }

    /**
     * Get the contents of the form.js file, for checksum calculations.
     * This is used by some third-party themes, and can't be removed yet.
     *
     * @param string $unique_id
     */
    public function get_form_js($unique_id = null)
    {
        return $this->load->view("invoices/form.js.php", $this->_get_form_data($unique_id), true);
    }

    public function form_js($unique_id = null)
    {
        $this->output->enable_profiler(false);
        header("Content-Type: application/javascript; charset=utf-8");
        $code = $this->load->view("invoices/form.js.php", $this->_get_form_data($unique_id), true);
        $this->output->append_output($code);
    }

    protected function _set_title($type) {
        switch ($type) {
            case "CREDIT_NOTE":
                $type = "credit_notes";
                Navigation::setContainerClass("#invoices", "");
                Navigation::setContainerClass("#estimates", "");
                Navigation::setContainerClass("admin/credit_notes/credit_notes", "active");
                break;
            case "ESTIMATE":
                $type = "estimates";
                Navigation::setContainerClass("#invoices", "");
                Navigation::setContainerClass("#estimates", "active");
                Navigation::setContainerClass("admin/credit_notes/credit_notes", "");
                break;
            default:
                $type = "invoices";
                Navigation::setContainerClass("#invoices", "active");
                Navigation::setContainerClass("#estimates", "");
                Navigation::setContainerClass("admin/credit_notes/credit_notes", "");
                break;
        }

        $this->template->title($this->_guess_title($type));
    }

    public function auto_charge($unique_id) {
        can('update', $this->invoice_m->getClientIdByUniqueId($unique_id), 'invoices') or access_denied();

        $invoice = $this->invoice_m->get_by_unique_id($unique_id);
        $gateways = Gateway::get_token_enabled_gateways($invoice['client_id']);
        $gateway_labels = Gateway::get_enabled_gateway_select_array(false, $invoice['client_id'], false);
        foreach ($gateways as $key => $gateway) {
            $gateways[$key] = $gateway_labels[$gateway];
        }
        $gateways = str_ireplace(" " . __("global:and") . " ", " " . __("global:or") . " ", implode_to_human_csv($gateways));

        if (count($_POST)) {
            foreach ($invoice['partial_payments'] as $part) {
                if (!$part['is_paid'] && $part['billableAmount'] > 0) {
                    if (Gateway::charge($part['unique_id'])) {
                        $this->session->set_flashdata('success', __("invoices:auto_charged", [$invoice['invoice_number']]));
                        redirect("admin/invoices/paid");
                    } else {
                        $this->session->set_flashdata('error', __("invoices:could_not_auto_charge", [$invoice['invoice_number']]));
                        redirect("admin/invoices/all_unpaid");
                    }
                }
            }
        } else {
            $this->load->view('invoices/confirm_auto_charge', [
                "invoice" => $invoice,
                "gateways" => $gateways,
            ]);
        }
    }

    public function duplicate($unique_id) {
        can('create', $this->invoice_m->getClientIdByUniqueId($unique_id), $this->invoice_m->getPermissionsItemTypeByUniqueId($unique_id)) or access_denied();

        $number = $this->invoice_m->getInvoiceNumberById($this->invoice_m->getIdByUniqueId($unique_id));

        $details = $this->invoice_m->duplicate($unique_id);
        $new_number = $details['number'];
        $new_unique_id = $details['unique_id'];
        $this->session->set_flashdata('success', __(human_invoice_type($this->invoice_m->get_type($unique_id)) . ':duplicated', array($number, $new_number)));
        redirect('admin/' . human_invoice_type($this->invoice_m->get_type($unique_id)) . '/edit/' . $new_unique_id);
    }

    public function convert($unique_id) {
        can('create', $this->invoice_m->getClientIdByUniqueId($unique_id), $this->invoice_m->getPermissionsItemTypeByUniqueId($unique_id)) or access_denied();

        $invoice = $this->invoice_m->get($unique_id);
        if ($invoice['type'] == "ESTIMATE") {
            $number = $this->invoice_m->convertEstimateToProjectByUniqueId($unique_id);

            if ($invoice['project_id'] > 0) {
                $project = $this->project_m->get_by(["id" => $invoice['project_id']]);
                if (isset($project->id)) {
                    $message = __('estimates:appended', array($number, $this->project_m->get_dropdown_per_client($invoice['client_id'], $invoice['project_id'])));
                } else {
                    $message = __('estimates:converted', array($number));
                }
            } else {
                $message = __('estimates:converted', array($number));
            }

            $this->session->set_flashdata('success', $message);
        } else {
            $number = $this->invoice_m->convertInvoiceToEstimateByUniqueId($unique_id);
            $this->session->set_flashdata('success', __('invoices:converted', array($number)));
        }
        redirect('admin/projects');
    }

    public function convert_to_invoice($unique_id) {
        can('create', $this->invoice_m->getClientIdByUniqueId($unique_id), 'invoices') or access_denied();

        $invoice = $this->invoice_m->get($unique_id);
        if ($invoice['type'] == "ESTIMATE") {
            $number = $this->invoice_m->convertEstimateToInvoiceByUniqueId($unique_id);
            $this->session->set_flashdata('success', __('estimates:converted_to_invoice', array($number)));
        } else {
            $number = $this->invoice_m->convertInvoiceToEstimateByUniqueId($unique_id);
            $this->session->set_flashdata('success', __('invoices:converted_to_estimate', array($number)));
        }


        redirect('admin/invoices/edit/' . $unique_id);
    }

    // ------------------------------------------------------------------------

    /**
     * Creates a new estimate
     *
     * @access    public
     * @return    void
     */
    public function create_estimate($iframe = null, $client_id = 0) {
        # There's no need to repeat code and hurt maintaininability.
        return $this->create($iframe, $client_id, 'ESTIMATE');
    }

    /**
     * Creates a new credit note
     *
     * @access    public
     * @return    void
     */
    public function create_credit_note($iframe = null, $client_id = 0) {
        # There's no need to repeat code and hurt maintaininability.
        return $this->create($iframe, $client_id, 'CREDIT_NOTE');
    }

    public function created($unique_id) {
        can('read', $this->invoice_m->getClientIdByUniqueId($unique_id), $this->invoice_m->getPermissionsItemTypeByUniqueId($unique_id), $this->invoice_m->getIdByUniqueId($unique_id)) or access_denied();

        $this->load->model('clients/clients_m');

        $invoice = (object) $this->invoice_m->get_by_unique_id($unique_id);

        if (!isset($invoice->id) or (isset($invoice->id) and empty($invoice->id))) {
            redirect('admin/invoices/all');
        }

        $this->template->invoice = $invoice;
        $this->template->unique_id = $unique_id;
        $this->_set_title($invoice->type);
        $this->template->build('created');
    }

    public function make_bulk_payment($client_id = null) {
        $this->load->model('clients/clients_m');
        $client = $this->clients_m->getById($client_id);
        if ($client) {
            if (isset($_POST["payment-gateway"])) {
                $gateway = $_POST["payment-gateway"];
                $tid = $_POST["payment-tid"];
                $date = empty($_POST["payment-date"]) ? 0 : carbon($_POST["payment-date"])->timestamp;
                $send_notification_email = isset($_POST["send_payment_notification"]);

                foreach ($_POST['payment_amount'] as $unique_id => $amount) {
                    if ($amount > 0) {
                        $this->ppm->addPayment($unique_id, $amount, $date, $gateway, $tid, 0, $send_notification_email);
                    }
                }

                $this->session->set_flashdata('success', __('invoices:bulk_payment_added'));
                redirect('admin/invoices/make_bulk_payment/' . $client_id);
            }

            $this->template->client = (object) $client;
            $this->template->unpaid_invoices = $this->invoice_m->get_all_unpaid($client_id);
            $this->template->build('make_bulk_payment');
        } else {
            show_404();
        }
    }

    /**
     * Page to send out an invoice notification email to a client.
     *
     * @param string $unique_id
     */
    public function send($unique_id) {

        can('send', $this->invoice_m->getClientIdByUniqueId($unique_id), $this->invoice_m->getPermissionsItemTypeByUniqueId($unique_id), $this->invoice_m->getIdByUniqueId($unique_id)) or access_denied();

        $result = @$this->invoice_m->sendNotificationEmail($unique_id, $this->input->post('message'), $this->input->post('subject'), $this->input->post('email'));

        if (!$result) {
            $this->session->set_flashdata('error', lang('global:couldnotsendemail'));
            $invoice = $this->invoice_m->get($unique_id);
            redirect('admin/invoices/created/' . $unique_id);
        } else {
            $this->session->set_flashdata('success', lang('global:emailsent'));
            $invoice = $this->invoice_m->get($unique_id);
            redirect('admin/invoices/' . $invoice['list_invoice_belongs_to']);
        }

    }

    function fix_all_invoices() {
        $this->invoice_m->fix_all_invoices();
        echo "Finished!";
    }

    // ------------------------------------------------------------------------

    /**
     * Edits a new invoice
     *
     * @param    string    The unique id of the invoice to edit
     *
     * @return    void
     */
    public function edit($unique_id) {
        can('update', $this->invoice_m->getClientIdByUniqueId($unique_id), $this->invoice_m->getPermissionsItemTypeByUniqueId($unique_id), $this->invoice_m->getIdByUniqueId($unique_id)) or access_denied();

        $this->load->model('clients/clients_m');
        $this->load->model("clients/clients_taxes_m");
        $this->load->model('files/files_m');
        $this->template->invoice = (object) $this->invoice_m->get_by_unique_id($unique_id);

        if (!isset($this->template->invoice->id) or (isset($this->template->invoice->id) and empty($this->template->invoice->id))) {
            $this->session->set_flashdata('error', __("invoices:edit_does_not_exist"));
            redirect('admin/invoices/all');
            return;
        }

        $item_ids = array();

        foreach ($this->template->invoice->items as $item) {
            $item_ids[] = $item['id'];
        }

        $item_time_entries = array();

        if (!empty($item_ids)) {
            $result = $this->db->query("select invoice_item_id, group_concat(id) as time_entries from " . $this->db->dbprefix("project_times") . " where invoice_item_id in (" . implode(',', $item_ids) . ") group by invoice_item_id")->result_array();
            foreach ($result as $row) {
                $item_time_entries[$row['invoice_item_id']] = $row['time_entries'];
            }
        }

        $this->template->item_time_entries = $item_time_entries;

        if (empty($this->template->invoice->items)) {
            $this->template->invoice->items[] = array(
                'name' => '',
                'description' => '',
                'qty' => 1,
                'rate' => '0.00',
                'tax_ids' => Settings::get_default_tax_ids(),
                'discount' => 0,
                'total' => 0,
                'discount_is_percentage' => 0,
            );
        }

        // Build the client dropdown array for the form
        $this->template->clients_dropdown = client_dropdown('estimates_plus_invoices', 'create_plus_update_and_generate');

        # This is remapped so as to not break third-party themes.
        $projects = [];
        foreach ($this->project_m->get_dropdown() as $id => $name) {
            $projects[$id] = new stdClass;
            $projects[$id]->id = $id;
            $projects[$id]->name = $name;
        }

        $this->template->projects = $projects;

        if ($_POST) {
            $postBuffer = $_POST;
            $buffer = isset($_POST['gateways']) ? $_POST['gateways'] : array();
            unset($postBuffer['gateways']);

            if ($result = $this->invoice_m->update($unique_id, $postBuffer, @$_FILES['invoice_files'])) {
                $id = $this->invoice_m->getIdByUniqueId($unique_id);
                require_once APPPATH . 'modules/gateways/gateway.php';
                Gateway::processItemInput('INVOICE', $id, $buffer);
                $delete_files = isset($_POST['remove_file']) ? $_POST['remove_file'] : array();
                foreach ($delete_files as $file_id) {
                    $this->files_m->delete($file_id);
                }
                if (isset($_FILES['invoice_files'])) {
                    $this->files_m->upload($_FILES['invoice_files'], $unique_id);
                }

                $invoice = $this->invoice_m->get_by_unique_id($unique_id);
                if ($invoice['last_sent']) {
                    $action = "resend";
                } else {
                    $action = "send_now";
                }

                $message = __(human_invoice_type($_POST['type']) . ':messageupdated');
                $message .= "<br />";
                $message .= anchor($unique_id, __(human_invoice_type($_POST['type']) . ':preview'), 'style="margin-right: 20px; display: inline-block;"');
                $message .= anchor('admin/invoices/created/' . $unique_id, __(human_invoice_type($_POST['type']) . ':' . $action), 'style="margin-left: 20px; display: inline-block;"');

                $this->session->set_flashdata('success', $message);
                redirect('admin/invoices/edit/' . $unique_id);

            }
        }

        $base_currency = Currency::get();
        $currencies = array(__('currencies:default', array(__($base_currency['name']))));
        foreach (Settings::all_currencies() as $currency) {
            $currencies[$currency['code']] = $currency['name'];
        }
        $this->template->currencies = $currencies;

        $this->template->client_ids_with_tokens = Gateway::get_clients_with_valid_tokens();

        $this->template->files = (array) $this->files_m->get_by_unique_id($unique_id);

        $this->template->gateways = Gateway::get_enabled_gateways();

        $this->template->type = $this->template->invoice->type;
        $this->template->client_id = $this->template->invoice->client_id;
        $this->template->invoice_number = $this->template->invoice->invoice_number;
        $this->template->items = $this->template->invoice->items;
        $this->template->unique_id = $this->template->invoice->unique_id;
        $this->template->is_edit = true;
        $this->_set_title($this->template->invoice->type);
        $this->template->build('form');
    }

    public function archive($unique_id) {
        $type = $this->invoice_m->get_type($unique_id);

        if ($type == "ESTIMATE") {
            can('update', $this->invoice_m->getClientIdByUniqueId($unique_id), 'estimates', $this->invoice_m->getIdByUniqueId($unique_id)) or access_denied();
            $return = 'admin/estimates/estimates_archived';
        } elseif ($type == "CREDIT_NOTE") {
            is_admin() or access_denied();
            $return = 'admin/credit_notes/credit_notes_archived';
        } else {
            can('update', $this->invoice_m->getClientIdByUniqueId($unique_id), 'invoices', $this->invoice_m->getIdByUniqueId($unique_id)) or access_denied();
            $return = 'admin/invoices/archived';
        }

        $this->invoice_m->archive($unique_id);
        $this->session->set_flashdata('success', __(human_invoice_type($type) . ':archived', array($this->invoice_m->getInvoiceNumberByUniqueId($unique_id))));
        redirect($return);
    }

    public function restore($unique_id) {
        $type = $this->invoice_m->get_type($unique_id);

        if ($type == "ESTIMATE") {
            can('update', $this->invoice_m->getClientIdByUniqueId($unique_id), 'estimates', $this->invoice_m->getIdByUniqueId($unique_id)) or access_denied();
            $return = 'admin/estimates/estimates';
        } elseif ($type == "CREDIT_NOTE") {
            is_admin() or access_denied();
            $return = 'admin/credit_notes/credit_notes';
        } else {
            can('update', $this->invoice_m->getClientIdByUniqueId($unique_id), 'invoices', $this->invoice_m->getIdByUniqueId($unique_id)) or access_denied();
            $return = 'admin/invoices/all';
        }

        $this->invoice_m->restore($unique_id);
        $this->session->set_flashdata('success', __(human_invoice_type($type) . ':restored', array($this->invoice_m->getInvoiceNumberByUniqueId($unique_id))));
        redirect($return);
    }

    public function index() {
        redirect('admin/invoices/all');
    }

    public function all($offset = 0) {
        $this->_get_list('all', $offset);
    }

    public function estimates($offset = 0) {
        $this->_get_list('estimates', $offset);
    }

    public function accepted($offset = 0) {
        $this->_get_list('accepted', $offset);
    }

    public function rejected($offset = 0) {
        $this->_get_list('rejected', $offset);
    }

    public function unanswered($offset = 0) {
        $this->_get_list('unanswered', $offset);
    }

    public function estimates_unsent($offset = 0) {
        $this->_get_list('estimates_unsent', $offset);
    }

    public function credit_notes($offset = 0) {
        $this->_get_list('credit_notes', $offset);
    }

    public function paid($offset = 0) {
        $this->_get_list('paid', $offset);
    }

    public function recurring($offset = 0) {
        $this->_get_list('recurring', $offset);
    }

    public function unsent($offset = 0) {
        $this->_get_list('unsent', $offset);
    }

    public function unsent_recurrences($offset = 0) {
        $this->_get_list('unsent_recurrences', $offset);
    }

    public function unsent_not_recurrences($offset = 0) {
        $this->_get_list('unsent_not_recurrences', $offset);
    }

    public function unpaid_recurrences($offset = 0) {
        $this->_get_list('unpaid_recurrences', $offset);
    }

    public function unpaid_not_recurrences($offset = 0) {
        $this->_get_list('unpaid_not_recurrences', $offset);
    }

    public function unpaid($offset = 0) {
        $this->_get_list('unpaid', $offset);
    }

    public function all_unpaid($offset = 0) {
        $this->_get_list('all_unpaid', $offset);
    }

    public function overdue($offset = 0) {
        $this->_get_list('overdue', $offset);
    }

    public function estimates_archived($offset = 0) {
        $this->_get_list('estimates_archived', $offset);
    }

    public function archived($offset = 0) {
        $this->_get_list('invoices_archived', $offset);
    }

    public function credit_notes_archived($offset = 0) {
        $this->_get_list('credit_notes_archived', $offset);
    }

    private function _get_list($type, $offset = 0) {

        switch ($type) {
            case 'unpaid':
                $buffer = 'sent_but_unpaid';
                break;
            case 'all_unpaid':
                $buffer = 'unpaid';
                break;
            default:
                $buffer = $type;
                break;
        }

        // Let's get the list and get this party started
        $this->_build_client_filter($buffer);
        $client_id = ($this->template->client_id != 0) ? $this->template->client_id : null;
        $count = get_count($buffer, $client_id);
        if ($count > 0 and $count <= $offset) {
            while ($count <= $offset) {
                $offset = ($offset - $this->pagination_config['per_page'] > 0) ? $offset - $this->pagination_config['per_page'] : 0;
            }

            redirect('admin/invoices/' . $type . '/' . $offset);
        }

        $pagination_type = $type;

        switch ($type) {
            case 'overdue':
                $invoices = $this->invoice_m->get_all_overdue($client_id, $offset, null, null, false);
                break;
            case 'unpaid':
                $invoices = $this->invoice_m->get_all_sent_but_unpaid($client_id, $offset, false);
                break;
            case 'all_unpaid':
                $invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'paid' => false, 'offset' => $offset, 'include_totals' => true, 'archived' => false));
                break;
            case 'unsent':
                $invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'sent' => false, 'offset' => $offset, 'include_totals' => true, 'archived' => false));
                break;
            case 'unsent_recurrences':
                $invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'recurrences' => true, 'sent' => false, 'offset' => $offset, 'include_totals' => true, 'archived' => false));
                break;
            case 'unsent_not_recurrences':
                $invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'recurrences' => false, 'sent' => false, 'offset' => $offset, 'include_totals' => true, 'archived' => false));
                break;
            case 'unpaid_recurrences':
                $invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'recurrences' => true, 'paid' => false, 'offset' => $offset, 'include_totals' => true, 'archived' => false));
                break;
            case 'unpaid_not_recurrences':
                $invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'recurrences' => false, 'paid' => false, 'offset' => $offset, 'include_totals' => true, 'archived' => false));
                break;
            case 'recurring':
                $invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'recurring' => true, 'offset' => $offset, 'include_totals' => true, 'archived' => false));
                break;
            case 'paid':
                $invoices = $this->invoice_m->get_all_paid($client_id, null, $offset, false);
                break;
            case 'estimates':
                $invoices = $this->invoice_m->get_all_estimates($client_id, $offset, null, null, false);
                break;
            case 'accepted':
                $invoices = $this->invoice_m->get_all_estimates($client_id, $offset, 'ACCEPTED', null, false);
                break;
            case 'unanswered':
                $invoices = $this->invoice_m->get_all_estimates($client_id, $offset, '', null, false);
                break;
            case 'rejected':
                $invoices = $this->invoice_m->get_all_estimates($client_id, $offset, 'REJECTED', null, false);
                break;
            case 'estimates_unsent':
                $invoices = $this->invoice_m->get_all_estimates($client_id, $offset, null, false, false);
                break;
            case 'credit_notes':
                $invoices = $this->invoice_m->get_all_credit_notes($client_id, $offset, false);
                break;
            case 'invoices_archived':
                $pagination_type = "archived";
                $invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'archived' => true, 'offset' => $offset, 'include_totals' => true));
                break;
            case 'estimates_archived':
                $invoices = $this->invoice_m->get_all_estimates($client_id, $offset, null, null, true);
                break;
            case 'credit_notes_archived':
                $invoices = $this->invoice_m->get_all_credit_notes($client_id, $offset, true);
                break;
            case 'all':
                $invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'offset' => $offset, 'include_totals' => true, 'archived' => false));;
                break;
        }

        $this->session->set_userdata('last_visited_invoice_page_type', $pagination_type);
        $this->session->set_userdata('last_visited_invoice_page_offset', $offset);

        if (!isset($invoices)) {
            throw new \Pancake\PancakeException("Could not _get_list() for the following type: $type");
        }

        $this->template->invoices = $invoices;

        // Start up the pagination
        $this->load->library('pagination');
        $this->pagination_config['base_url'] = site_url('admin/invoices/' . $pagination_type);
        $this->pagination_config['uri_segment'] = 4;
        $this->pagination_config['total_rows'] = $count;
        $this->pagination->initialize($this->pagination_config);

        switch ($type) {
            case 'unpaid':
                $buffer = 'sentbutunpaid';
                break;
            case 'unsent':
                $buffer = 'unsentinvoices';
                break;
            case 'recurring':
                $buffer = 'recurringinvoices';
                break;
            default:
                $buffer = $type;
                break;
        }

        /*"estimates:estimates_archived" => "invoices:estimates_archived",
        "credit_notes:credit_notes_archived" => "invoices:credit_notes_archived",*/

        switch ($type) {
            case 'estimates':
            case 'rejected':
            case 'accepted':
            case 'unanswered':
            case 'estimates_unsent':
                $this->_set_title('ESTIMATE');
                $this->template->type = "ESTIMATE";
                $this->template->list_title = __('estimates:' . ($type == 'estimates' ? 'alltitle' : $type));
                break;
            case 'estimates_archived':
                $this->_set_title('ESTIMATE');
                $this->template->type = "ESTIMATE";
                $this->template->list_title = __("invoices:$type");
                break;
            case 'credit_notes':
                $this->_set_title('CREDIT_NOTE');
                $this->template->type = "CREDIT_NOTE";
                $this->template->list_title = __('credit_notes:alltitle');
                break;
            case 'credit_notes_archived':
                $this->_set_title('CREDIT_NOTE');
                $this->template->type = "CREDIT_NOTE";
                $this->template->list_title = __("invoices:$type");
                break;
            case 'all':
            case 'paid':
            case 'all_unpaid':
            case 'overdue':
            case 'unpaid':
            case 'unsent':
            case 'recurring':
            case 'invoices_archived':
            case 'unsent_not_recurrences':
            case 'unsent_recurrences':
            case 'unpaid_not_recurrences':
            case 'unpaid_recurrences':
                $this->_set_title("DETAILED");
                $this->template->type = "DETAILED";
                $this->template->list_title = __('invoices:' . $buffer);
                break;
            default:
                throw new Exception("Don't know how to classify {$type}.");
                break;
        }

        $this->template->build('all');
    }

    // ------------------------------------------------------------------------

    /**
     * Deletes an invoice (it was nice while it lasted)
     *
     * @param    string    The unique id of the invoice to delete
     *
     * @return    void
     */
    public function delete($unique_id) {
        if (!$this->invoice_m->exists(["unique_id" => $unique_id])) {
            $this->session->set_flashdata('success', __('invoices:delete_does_not_exist'));
            redirect('/admin/invoices/all');
        }

        can('delete', $this->invoice_m->getClientIdByUniqueId($unique_id), $this->invoice_m->getPermissionsItemTypeByUniqueId($unique_id), $this->invoice_m->getIdByUniqueId($unique_id)) or access_denied();

        $estimate = $this->invoice_m->is_estimate($unique_id);

        if ($estimate) {
            $this->template->module = 'estimates';
        }

        if ($_POST) {
            $this->invoice_m->delete($unique_id);
            $this->session->set_flashdata('success', __(((isset($estimate) and $estimate) ? 'estimates' : 'invoices') . ':deleted'));
            redirect('admin/invoices/' . $this->session->userdata('last_visited_invoice_page_type') . '/' . $this->session->userdata('last_visited_invoice_page_offset'));
        }

        // We set a unique action hash here to stop CSRF attacks (hacker's beware)
        $action_hash = md5(time() . $unique_id);
        $this->session->set_userdata('action_hash', $action_hash);
        $this->template->action_hash = $action_hash;
        $this->template->estimate = $estimate;

        // Lets make sure before we just go killing stuff like Rambo
        $this->template->unique_id = $unique_id;
        $type = $this->invoice_m->get_type($unique_id);
        $this->template->type = $type;
        $this->_set_title($type);
        $this->template->build('are_you_sure');
    }

    // ------------------------------------------------------------------------

    /**
     * Builds the reminders page
     *
     * @return    void
     */

    public function reminders() {
        is_admin() or access_denied();
        $invoices = $this->invoice_m->get_all_sent_but_unpaid(null, null, false, [
            "computed_due_date" => "asc",
        ]);

        $this->load->model('emails/emails_m');
        $email_templates = $this->emails_m->order_by('name')->get_all();

        $data = array(
            'invoices' => $invoices,
            'email_templates' => $email_templates,
        );


        if ($this->session->flashdata('success')) {
            $this->template->messages = array('success', __('reminders:success'));
        }


        $this->template->build('reminders_list', $data);


    }

    // ------------------------------------------------------------------------


    /**
     * Processes the posted list of items to remind
     *
     * @access    public
     * @return    void
     */
    public function remind() {
        is_admin() or access_denied();

        $this->load->model('emails/emails_m');

        if ($this->input->post('invoice')) {
            foreach ($this->input->post('invoice') as $id => $invoice) {
                if (isset($invoice['remind']) && $invoice['remind']) {
                    $message = $this->emails_m->get($invoice['template']);

                    $sendit = $this->invoice_m->sendNotificationEmail($id, $message->content, $message->subject, $invoice['email_address']);

                }
            }
        }

        $this->session->set_flashdata('success', __('reminders:success'));
        redirect('/admin/invoices/reminders');
    }

    private function _build_client_filter($type = '') {
        $this->template->clients_dropdown = client_dropdown($type == 'estimates' ? 'estimates' : 'invoices', 'read', $type, __("clients:all"), '0');
        $client_id = isset($_GET['client_id']) ? $_GET['client_id'] : 0;

        if (!isset($this->template->clients_dropdown[$client_id])) {
            $client_id = 0;
        }

        $this->template->client_id = $client_id;
    }

}

/* End of file: admin.php */