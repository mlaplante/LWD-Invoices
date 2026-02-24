<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright	Copyright (c) 2011, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 2.2
 */
// ------------------------------------------------------------------------

/**
 * The admin controller for proposals
 *
 * @subpackage	Controllers
 * @category	Proposals
 */
class Admin extends Admin_Controller
{
	public function __construct()
	{
        parent::__construct();
        $this->load->model('proposals/proposals_m');
        $this->load->model('clients/clients_m');
    }

    public function index()
	{
        redirect('admin/proposals/all');
    }

    protected function _get_list($type, $offset = 0) {
        $this->_build_client_filter('proposals');
        $client_id = ($this->template->client_id != 0) ? $this->template->client_id : NULL;
        if ($client_id !== NULL) {
            $where = array('client_id' => $client_id);
        } else {
            $where = array();
        }

        if ($type == "all") {
            $where['is_archived'] = 0;
        } elseif ($type == "archived") {
            $where['is_archived'] = 1;
        } else {
            $status = strtoupper($type);
            $status = $status == "UNANSWERED" ? "" : $status;
            $where['status'] = $status;
            $where['is_archived'] = 0;
        }

        // Start up the pagination
        $this->load->library('pagination');
        $this->pagination_config['base_url'] = site_url('admin/proposals/all/');
        $this->pagination_config['uri_segment'] = 4;
        $this->pagination_config['total_rows'] = $this->proposals_m->count($where);
        $this->pagination->initialize($this->pagination_config);

        $this->template->list_title = __("proposals:list_$type");

        $data = array('proposals' => $this->proposals_m->getAll($this->pagination->per_page, $offset, $where));
        $this->template->build('all', $data);
    }

    public function all($offset = 0) {
        $this->_get_list('all', $offset);
    }

    public function archived($offset = 0) {
        $this->_get_list('archived', $offset);
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

    public function archive($unique_id) {
        $proposal = (array) array_reset($this->proposals_m->getAll(null, null, array('unique_id' => $unique_id)));
        can('update', $this->proposals_m->getClientIdByUniqueId($unique_id), 'proposals', $proposal['id']) or access_denied();
        $this->proposals_m->archive($unique_id);
        $this->session->set_flashdata('success', __('proposals:archived', array($proposal['proposal_number'])));
        redirect('admin/proposals/archived');
    }

    public function restore($unique_id) {
        $proposal = (array) array_reset($this->proposals_m->getAll(null, null, array('unique_id' => $unique_id)));
        can('update', $this->proposals_m->getClientIdByUniqueId($unique_id), 'proposals', $proposal['id']) or access_denied();
        $this->proposals_m->restore($unique_id);
        $this->session->set_flashdata('success', __('proposals:restored', array($proposal['proposal_number'])));
        redirect('admin/proposals/all');
    }

    public function send($unique_id)
	{
		can('send', $this->proposals_m->getClientIdByUniqueId($unique_id), 'proposals', $this->proposals_m->getIdByUniqueId($unique_id)) or access_denied();

        if (isset($_POST['message']))
		{
            $result = $this->proposals_m->sendNotificationEmail($unique_id, $this->input->post('message'), $this->input->post('subject'), $this->input->post('email'));

            if ( ! $result)
			{
                $this->session->set_flashdata('error', lang('global:couldnotsendemail'));
				redirect('admin/proposals/send/'.$unique_id);
            }
			else
			{
                $this->session->set_flashdata('success', lang('global:emailsent'));
				redirect('admin/proposals/send/'.$unique_id);
            }
        }

		$this->proposals_m->get_estimates = false;
        $proposal = $this->proposals_m->getByUniqueId($unique_id, false);

        if ( ! isset($proposal['id']) or empty($proposal['id']))
		{
            redirect('admin/proposals/all');
        }

        $this->template->proposal = $proposal;
        $this->template->unique_id = $unique_id;

        $this->template->build('send');
    }

    public function duplicate($unique_id)
	{
		can('create', $this->proposals_m->getClientIdByUniqueId($unique_id), 'proposals') or access_denied();

		$number = $this->proposals_m->getProposalNumberByUniqueId($unique_id);
		$new_number = $this->proposals_m->duplicate($unique_id);
		$this->session->set_flashdata('success', __('proposals:duplicated', array($number, $new_number)));
		redirect('admin/proposals/all/0');
    }

    public function create()
	{


    	if ($_POST)
		{

            can('create', $_POST['client_id'], 'proposals') or access_denied();

            if (!$this->clients_m->exists($_POST['client_id'])) {
                $this->session->set_flashdata('error', __("proposals:missing_client"));
                redirect('admin/proposals/all/0');
            }

            $unique_id = $this->proposals_m->create(array(
				'title' => $_POST['title'],
				'client_id' => $_POST['client_id'],
				'proposal_number' => $_POST['proposal_number'],
			));
            redirect('proposal/' . $unique_id);
        }

		$this->load->view('form', array(
			'proposal_number' => $this->proposals_m->_generate_proposal_number(),
			'clients_dropdown' => client_dropdown('proposals', 'create_plus_update'),
			'action' => 'create',
		));
    }

    public function edit($unique_id)
	{
		can('update', $this->proposals_m->getClientIdByUniqueId($unique_id), 'proposals', $this->proposals_m->getIdByUniqueId($unique_id)) or access_denied();

        redirect('proposal/' . $unique_id);
    }

    public function delete($unique_id)
	{
		can('delete', $this->proposals_m->getClientIdByUniqueId($unique_id), 'proposals', $this->proposals_m->getIdByUniqueId($unique_id)) or access_denied();

        if ($_POST)
		{
            // Check to make sure the action hash matches, if not kick em' to the curb
            if ($this->input->post('action_hash') !== $this->session->userdata('action_hash'))
			{
                $this->session->set_flashdata('error', 'Insecure action was attempted but caught');
                redirect('admin/dashboard');
            }
            $this->load->model('proposals_m');

            $this->proposals_m->delete($unique_id);

            // Delete the invoices for the user
            $this->session->set_flashdata('success', 'The proposal has been deleted!');
            redirect('admin/proposals');
        }

        // We set a unique action hash here to stop CSRF attacks (hacker's beware)
        $action_hash = md5(time() . $unique_id);
        $this->session->set_userdata('action_hash', $action_hash);
        $this->template->action_hash = $action_hash;

        // Lets make sure before we just go killing stuff like Rambo
        $this->template->proposal_id = $unique_id;
        $this->template->build('are_you_sure');
    }

    /**
     * Builds the client dropdown array and sets the current client id
     *
     * @return	void
     */
    private function _build_client_filter($type = '') {
        $this->template->clients_dropdown = client_dropdown('proposals', 'read', $type, __("clients:all"), '0');
        $client_id = isset($_GET['client_id']) ? $_GET['client_id'] : 0;

        if (!isset($this->template->clients_dropdown[$client_id])) {
            $client_id = 0;
        }

        $this->template->client_id = $client_id;
    }

}