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
 * The admin controller for Clients
 *
 * @subpackage	Controllers
 * @category	Clients
 */
class Admin extends Admin_Controller {

    /**
     * The construct doesn't do anything useful right now.
     *
     * @access	public
     * @return	void
     */
    public function __construct() {
        parent::__construct();
        $this->load->model('clients_m');
        $this->load->model('clients/clients_meta_m');
        $this->load->model('clients/clients_taxes_m');
        $this->load->model('clients/clients_credit_alterations_m');
        $this->load->model('projects/project_m');
        $this->load->model('projects/project_expense_m');
    }

    # Pancake 4 Rules!
    // ------------------------------------------------------------------------

    /**
     * Loads all the clients in and sends then to be outputted
     *
     * @access	public
     * @return	void
     */
    public function index($offset = 0, $filter = null) {
        $this->load->model('invoices/invoice_m');

        if ($filter !== null) {
            $data = $this->clients_m->get_filtered($filter, $this->pagination_config['per_page'], $offset);
            $clients = $data['clients'];
            $count = $data['count'];
        } else {
            /*
             * This is a hacky solution to the custom client-sorting problem.
             * If someone is using the Custom Client Names plugin, then clients need to still be sorted.
             * Only MySQL can't be used to do the sorting because we don't know what their names will all end up like.
             *
             * So we get the full list of clients (which we already have for client dropdowns).
             * That list is already properly sorted, because it loops through every client.
             *
             * So we use the order of the primary keys in the client dropdown to inform MySQL's query ordering,
             * which lets MySQL do the ordering, which means pagination keeps working without any problems.
             *
             * If you know of a better / higher-performance way to do this, I'm all ears.
             *
             * - Bruno
             */
            if (Events::has_listeners('sort_clients')) {
                $dropdown = client_dropdown("clients", "read");
                unset($dropdown[""]);
                $this->db->qb_orderby[] = "field(id, " . implode(",", array_keys($dropdown)) . ")";
            } else {
                $this->clients_m->order_by('first_name');
            }

            where_assigned('clients', 'read');

            $clients = $this->clients_m->limit($this->pagination_config['per_page'], $offset)->get_all();
            $count = $this->clients_m->count();
        }

        $this->template->filter = $filter;

        // Start up the pagination
        $this->load->library('pagination');
        $this->pagination_config['base_url'] = site_url('admin/clients/index/');
        $this->pagination_config['uri_segment'] = 4;
        if ($filter !== null) {
            $this->pagination_config['suffix'] = "/$filter";
        }
        $this->pagination_config['total_rows'] = $count;
        $this->pagination->initialize($this->pagination_config);

        $this->clients_m->process_clients($clients);
        
        $data = $this->dispatch_return('process_clients_list', array(
            'clients' => $clients,
        ), 'array');
        
        # Altered by a plugin.
        if (!isset($data['clients'])) {
            $data = reset($data);
        }
        
        $this->template->clients = $data['clients'];
        $this->template->all_client_taxes = $this->clients_taxes_m->fetch_all();
        $this->template->custom = $this->clients_meta_m->fetch_all();

        $this->template->build('list');
    }

    // ------------------------------------------------------------------------

    /**
     * Creates a client
     *
     * @access	public
     * @return	void
     */
    public function create() {
        $can_create_clients = $this->dispatch_return('decide_can_create_clients', array('user_id' => current_user()), 'boolean');
        $can_create_clients = is_array($can_create_clients) ? is_admin() : $can_create_clients;
                    
        if (!$can_create_clients) {
            access_denied();
        }
        
        if ($_POST) {
            $_POST['created'] = time();

            if (isset($_POST['default_tax_id'])) {
                $default_taxes = $_POST['default_tax_id'];
                unset($_POST['default_tax_id']);
            } else {
                $default_taxes = [];
            }

            $_POST['can_create_support_tickets'] = isset($_POST['can_create_support_tickets']);
            $_POST['can_view_invoices_without_passphrase'] = isset($_POST['can_view_invoices_without_passphrase']);
            $postBuffer = $_POST;
            $buffer = isset($_POST['gateways']) ? $_POST['gateways'] : array();
            unset($postBuffer['gateways']);

            $tax = isset($_POST['tax']) ? $_POST['tax'] : array();
            unset($postBuffer['tax']);
            $custom = isset($_POST['custom']) ? $_POST['custom'] : array();
            unset($postBuffer['custom']);

            if ($result = $this->clients_m->insert($postBuffer)) {
                require_once APPPATH . 'modules/gateways/gateway.php';
                Gateway::processItemInput('CLIENT', $result, $buffer);

                if (!empty($custom) && isset($custom['label']) && isset($custom['value'])) {
                    $this->clients_meta_m->store($result, $custom['label'], $custom['value']);
                }

                if (!empty($tax)) {
                    $this->clients_taxes_m->store($result, $tax);
                }

                if (count($default_taxes)) {
                    $this->clients_taxes_m->set_default($result, $default_taxes);
                }

                $this->session->set_flashdata('success', lang('clients:added'));
                redirect('admin/clients/view/' . $result);
            } else {
                $this->template->error = validation_errors();
            }
        }

        $this->template->custom_fields = $this->clients_meta_m->fetch();
        $this->template->users = $this->ion_auth->get_users_array();
        $this->template->action_type = 'add';
        $this->template->languages = $this->settings_m->get_languages();
        $this->load->model("business_identities_m");
        $this->template->businesses = $this->business_identities_m->getAllBusinessesDropdown();
        $this->template->currencies = Settings::currencies_dropdown();
        $this->template->default_tax_ids = Settings::get_default_tax_ids();
        $this->template->action = 'create';
        $this->template->build('form');
    }

    // ------------------------------------------------------------------------

    /**
     * Edits a client
     *
     * @access	public
     * @return	void
     */
    public function edit($client_id) {
        can('update', $client_id, 'clients', $client_id) or access_denied();

        $this->load->model('clients_m');

        if (!$client = $this->clients_m->get($client_id)) {
            $this->session->set_flashdata('error', lang('clients:does_not_exist'));
            redirect('admin/clients');
        }

        if ($_POST) {
            if (isset($_POST['default_tax_id'])) {
                $default_taxes = $_POST['default_tax_id'];
                unset($_POST['default_tax_id']);
            } else {
                $default_taxes = [];
            }

            $_POST['can_create_support_tickets'] = isset($_POST['can_create_support_tickets']);
            $_POST['can_view_invoices_without_passphrase'] = isset($_POST['can_view_invoices_without_passphrase']);
            $postBuffer = $_POST;
            $buffer = isset($_POST['gateways']) ? $_POST['gateways'] : array();
            unset($postBuffer['gateways']);

            $tax = isset($_POST['tax']) ? $_POST['tax'] : array();
            unset($postBuffer['tax']);
            $custom = isset($_POST['custom']) ? $_POST['custom'] : array();
            unset($postBuffer['custom']);

            if ($result = $this->clients_m->update($client_id, $postBuffer)) {
                require_once APPPATH . 'modules/gateways/gateway.php';
                Gateway::processItemInput('CLIENT', $client_id, $buffer);

                if (!empty($custom)) {
                    $this->clients_meta_m->store($client_id, $custom['label'], $custom['value']);
                }

                if (!empty($tax)) {
                    $this->clients_taxes_m->store($client_id, $tax);
                }

                if (count($default_taxes)) {
                    $this->clients_taxes_m->set_default($client_id, $default_taxes);
                }

                $this->session->set_flashdata('success', lang('clients:edited'));
                redirect('admin/clients/view/'.$client_id);
            } else {
                $this->template->error = validation_errors();
            }
        } else {
            foreach ((array) $client as $key => $val) {

                if ($key == "balance") {
                    $val = floatval($val);
                }

                if ($key == "language" && empty($val)) {
                    $val = Settings::get('language');
                }

                $_POST[$key] = $val;
            }
        }

        $this->template->client_taxes = $this->clients_taxes_m->fetch($client_id);
        $this->template->custom_fields = $this->clients_meta_m->fetch($client_id);
        $this->template->users = $this->ion_auth->get_users_array();
        $this->template->action_type = 'edit';
        $this->template->client_id = $client_id;
        $this->template->languages = $this->settings_m->get_languages();
        $this->load->model("business_identities_m");
        $this->template->businesses = $this->business_identities_m->getAllBusinessesDropdown();
        $this->template->currencies = Settings::currencies_dropdown();
        $this->template->default_tax_ids = $this->clients_taxes_m->get_default($client_id);
        $this->template->action = 'edit/' . $client_id;
        $this->template->build('form');
    }

    /**
     * Show the support rates form
     * @param int $client_id ID of the client
     */
    public function support_matrix_form($client_id) {
        $this->load->view('support_rates_form', get_client_support_matrix($client_id));
    }

    public function get_client_support_matrix_json() {
        echo json_encode(get_client_support_matrix($this->input->post('client_id')));
        return;
    }

    public function edit_support_rates() {
        $this->load->model('client_support_rates_matrix_m', 'csrm');

        if ($this->csrm->store($_POST['client_id'], $_POST['ticket_priorities'])) {
            $this->session->set_flashdata('success', lang('clients:edited'));
        }



        redirect('admin/clients/edit/' . $_POST['client_id']);
    }

    // ------------------------------------------------------------------------

    /**
     * Edits a client
     *
     * @access	public
     * @return	void
     */
    public function delete($client_id) {
        can('delete', $client_id, 'clients', $client_id) or access_denied();

        if ($_POST) {
            // Check to make sure the action hash matches, if not kick em' to the curb
            if ($this->input->post('action_hash') !== $this->session->userdata('action_hash')) {
                $this->session->set_flashdata('error', lang('global:insecure_action'));
                redirect('admin/dashboard');
            }

            # This deletes all invoices, projects and proposals related to the client.
            $this->clients_m->delete($client_id);
            $this->session->set_flashdata('success', lang('clients:deleted'));
            redirect('admin/clients');
        }

        // We set a unique action hash here to stop CSRF attacks (hacker's beware)
        $action_hash = md5(time() . $client_id);
        $this->session->set_userdata('action_hash', $action_hash);
        $this->template->action_hash = $action_hash;

        // Lets make sure before we just go killing stuff like Rambo
        $this->template->client_id = $client_id;
        $this->template->build('are_you_sure');
    }

    // ------------------------------------------------------------------------

    public function view_contact($contact_log_id = null) {
        if (!$contact_log_id) {
            redirect("admin/clients");
        }

        $this->load->model("clients/contact_m");
        $contact = $this->contact_m->get_contact($contact_log_id);
        if ($contact['method'] == 'email') {

            $logo_settings = $this->dispatch_return('get_logo_settings', array('max-height' => 100, 'max-width' => 320), 'array');
            if (count($logo_settings) == 1) {
                # $logo_settings was modified by a plugin.
                $logo_settings = reset($logo_settings);
            }

            if (stristr($contact['content'], "<html") !== false) {
                # This contact history record already has a HTML template; don't re-add it.
                echo $contact['content'];
            } else {
                $template = Email_Template::build("default", nl2br($contact['content']), $contact['subject']);
                $template = str_ireplace('{{bcc}}', '', $template);
                $template = str_ireplace('{{tracking_image}}', '', $template);
                echo $template;
            }
        } else {
            throw new Exception("Cannot view details of contacts that are not 'email'. This contact's method was: {$contact['method']}");
        }
    }

    /**
     * SHows the clients info
     *
     * @access	public
     * @param	string	The client id
     * @return	void
     */
    public function view($client_id) {
        can('read', $client_id, 'clients', $client_id) or access_denied();

        $client = $this->clients_m->get($client_id);

        if (!$client) {
            $this->session->set_flashdata('error', lang('clients:does_not_exist'));
            redirect('admin/clients');
        }

        $client = [$client];
        $this->clients_m->process_clients($client);
        $client = reset($client);

        $this->load->model(array('invoices/invoice_m', 'clients/contact_m', 'projects/project_m'));

        $contact_log = $this->contact_m->get_recent_contact($client_id);

        $client_totals = $this->clients_m->get_client_totals($client_id);

        $totals['paid'] = $client_totals['paid_totals']['total'];
        $totals['unpaid'] = $client_totals['unpaid_totals']['total'];
        $totals['overdue'] = $client_totals['overdue_totals']['total'];
        $totals['count'] = $client_totals['count'];

        $invoices['paid'] = $this->invoice_m->get_all_paid($client_id, null, null, false);
        $invoices['unpaid'] = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'archived' => false, 'overdue' => false, 'paid' => false, 'include_totals' => true));
        $invoices['overdue'] = $this->invoice_m->get_all_overdue($client_id, null, null, null, false);

        $invoices['estimates'] = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'archived' => false, 'type' => 'estimates', 'include_totals' => true));
        $invoices['credit_notes'] = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'archived' => false, 'type' => 'credit_notes', 'include_totals' => true));

        $projects['active'] = $this->project_m->get_unarchived_projects('', '', $client_id);
        $projects['archived'] = $this->project_m->get_archived_projects('', '', $client_id);

        $this->template->custom = $this->clients_meta_m->fetch($client_id);

        $business_identity = $this->business_identities_m->getBusinessDetails($client->business_identity);

        $this->template->build('view', array(
            'totals' => $totals,
            'invoices' => $invoices,
            'client' => $client,
            'contact_log' => $contact_log,
            'show_business_identity' => count($this->business_identities_m->getAllBusinesses()) > 1,
            'business_identity_name' => $business_identity["brand_name"],
            'projects' => $projects,
            'expenses_sum' => $this->project_expense_m->get_sum_via_client($client->id)
        ));
    }

    // ------------------------------------------------------------------------

    /**
     * Shows the clients info
     *
     * @access	public
     * @param	string	The client id
     * @return	void
     */
    public function call($client_id, $type) {
        can('read', $client_id, 'clients', $client_id) or access_denied();

        if (!($client = $this->clients_m->get($client_id))) {
            $this->session->set_flashdata('error', lang('clients:does_not_exist'));
            redirect('admin/clients');
        }

        $this->load->view('call_form', array(
            'client' => $client,
            'phone_type' => $type,
        ));
    }

    function edit_balance($client_id) {
        can('update', $client_id, 'clients', $client_id) or access_denied();

        if (isset($_POST['action'])) {
            if ($_POST['amount'] == 0) {
                $this->session->set_flashdata('error', __('clients:no_amount_specified'));
                redirect("admin/clients/view/$client_id");
            }

            $_POST['amount'] = (float) $_POST['amount'];

            if ($_POST['action'] == "add") {
                $this->clients_credit_alterations_m->add($client_id, $_POST['amount']);
            } else {
                $this->clients_credit_alterations_m->remove($client_id, $_POST['amount']);
            }

            $this->session->set_flashdata('success', __('clients:balance_updated'));
            redirect("admin/clients/view/$client_id");
        }

        $data = array(
            "client_id" => $client_id,
            "current_balance" => Currency::format($this->clients_m->get_balance($client_id)),
            "add_remove_options" => array(
                "add" => __("global:add"),
                "remove" => __("global:remove")
            ),
        );
        $this->load->view('clients/balance', $data);
    }

    function send_client_area_email($client_id) {
        can('update', $client_id, 'clients', $client_id) or access_denied();

        if (filter_has_var(INPUT_POST, "message")) {
            $result = $this->clients_m->send_client_area_email($client_id, $this->input->post('message'), $this->input->post('subject'), $this->input->post('email'));

            if (!$result) {
                $this->session->set_flashdata('error', lang('global:couldnotsendemail'));
                redirect('admin/clients/view/' . $client_id);
            } else {
                $this->session->set_flashdata('success', lang('global:emailsent'));
                redirect('admin/clients/view/' . $client_id);
            }
        }

        $client = $this->clients_m->getById($client_id);

        if (!isset($client['id']) or empty($client['id'])) {
            redirect('admin/clients');
        }

        $this->template->client = $client;
        $this->template->build('send_client_area_email');
    }

}

/* End of file: admin.php */