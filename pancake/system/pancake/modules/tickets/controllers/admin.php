<?php defined('BASEPATH') OR exit('No direct script access allowed');
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
 * @property Ticket_statuses_m $statuses
 * @property Ticket_priorities_m $priorities
 */
class Admin extends Admin_Controller
{
	/**
	 * The construct doesn't do anything useful right now.
	 *
	 * @access	public
	 * @return	void
	 */
	public function __construct()
	{
		parent::__construct();

		$this->load->model(array(
			'ticket_m', 'ticket_post_m', 'ticket_history_m', 'clients/clients_m'));

		$this->load->model('invoices/invoice_m');
		$this->load->model('ticket_statuses_m','statuses');
		$this->load->model('ticket_priorities_m','priorities');

	}

	// ------------------------------------------------------------------------

        /**
	 * Loads all the tickets
	 *
	 * @access	public
	 * @return	void
	 */
	public function archived($offset = 0)
	{

      	//get tickets assigned to current user or where no user is assigned
      	//pagination and sorting coming soon

      	$user = $this->ion_auth->get_user();
                $this->db->order_by('created', 'desc');
		$tickets = $this->ticket_m->select()->join_priority()->join_status()->join_client()->where_archived()->assigned_to($user->id, $this->ion_auth->is_admin())->get_all();
		foreach($tickets as &$ticket)
		{
			$this->ticket_m->get_latest_post($ticket);
		}

		$data = array(
			'tickets' => $tickets,
		);


		$this->template->build('list', $data);
	}

	/**
	 * Loads all the tickets
	 *
	 * @access	public
	 * @return	void
	 */
	public function index($offset = 0)
	{

      	//get tickets assigned to current user or where no user is assigned
      	//pagination and sorting coming soon

      	$user = $this->ion_auth->get_user();

                $this->db->order_by('created', 'desc');
		$tickets = $this->ticket_m->select()->join_priority()->join_status()->join_client()->where_unarchived()->assigned_to($user->id, $this->ion_auth->is_admin())->get_all();
		foreach($tickets as &$ticket)
		{
			$this->ticket_m->get_latest_post($ticket);
		}

		$data = array(
			'tickets' => $tickets,
		);


		$this->template->build('list', $data);
	}

	public function view($ticket_id)
	{
		$ticket_id = (int) $ticket_id;

		//make sure user has access to ticket

		$user = $this->ion_auth->get_user();

		$current_ticket = $this->ticket_m->select()->join_priority()->join_status()->join_client()->assigned_to($user->id, $this->ion_auth->is_admin())->get_by('tickets.id', $ticket_id);

		if(!$current_ticket)
		{
			show_error('Error: This ticket does not exist, or you do not have permission to view this ticket.');
		}

		$this->ticket_m->get_priority($current_ticket);
		$this->ticket_m->get_status($current_ticket);
		$this->ticket_m->get_posts($current_ticket);
		$this->ticket_m->get_history($current_ticket);

                if ($current_ticket->invoice_id) {
                    $current_ticket->invoice = $this->invoice_m->get_by_unique_id($this->invoice_m->getUniqueIdById($current_ticket->invoice_id));
                }

                //combine posts and history into 1 array that we can sort by time
		$current_ticket->activity = array();
		foreach($current_ticket->posts as $post)
		{
			if(!isset($current_ticket->activity[$post->created]))
			{
				$current_ticket->activity[$post->created] = array();
			}
			$this->ticket_post_m->get_user($post);
			$current_ticket->activity[$post->created]['post'] = $post;
		}
		foreach($current_ticket->history as $history)
		{
			if(!isset($current_ticket->activity[$history->created]))
			{
				$current_ticket->activity[$history->created] = array();
			}
			$this->ticket_history_m->get_status($history);
			$current_ticket->activity[$history->created]['history'] = $history;
		}
		ksort($current_ticket->activity);

                if ($current_ticket->is_archived) {
                    $this->ticket_m->where_archived();
                } else {
                    $this->ticket_m->where_unarchived();
                }

                $this->db->order_by('created', 'desc');
		$tickets = $this->ticket_m->select()->join_priority()->join_status()->join_client()->assigned_to($user->id, $this->ion_auth->is_admin())->get_all();
		foreach($tickets as &$ticket)
		{
			$this->ticket_m->get_latest_post($ticket);
                        $this->ticket_m->get_latest_history($ticket);
		}

		$users = $this->ion_auth->get_users();
        $users_select = array('' => __('milestones:select_assignee_default'));
        foreach ($users as $user) {
            $users_select[$user->id] = $user->first_name . ' ' . $user->last_name . ' (' . $user->username . ')';
        }

		$data = array(
			'users_select' => $users_select,
			'statuses' => $this->statuses->getDropdown(),
			'priorities' => $this->priorities->getDropdown(),
			'tickets' => $tickets,
			'current_ticket' => $current_ticket,
		);


		$this->template->build('ticket', $data);
	}

	public function create()
	{

		if($_POST){
			$user = $this->ion_auth->get_user();

            can('create', $this->input->post('client_id'), 'tickets') or access_denied();

			$ticket_id = $this->ticket_m->insert(array(
				'subject'=> $this->input->post('subject'),
				'client_id' => $this->input->post('client_id'),
				'assigned_user_id' => fix_assigned($this->input->post('assigned_user_id')),
				'status_id' => $this->input->post('status_id'),
				'priority_id' => $this->input->post('priority_id'),
				'created' => time(),
			));

			if ($ticket_id)
			{
				//if we're just changing the status of a ticket, we don't need to send a message and the validation rule should take care of that
				$post_id = $this->ticket_post_m->insert(array(
					'ticket_id' => $ticket_id,
					'user_id' => $user->id,
					'user_name' => $user->first_name.' '.$user->last_name,
					'message' => $this->input->post('message'),
                                        'orig_filename' => '',
                                        'real_filename' => '',
					'created' => time(),
				));

				$this->ticket_history_m->insert(array(
					'ticket_id' => $ticket_id,
					'user_id' => $user->id,
					'user_name' => $user->first_name.' '.$user->last_name,
					'status_id' => $this->input->post('status_id'),
					'created' => time(),
				));

				//send email notification with link to kitchen/ticket and if you're feeling sassy, an anchor to this message.
				//ok :-D

				$this->ticket_m->sendNotificationEmail('email_new_ticket',$ticket_id);
				$this->ticket_m->sendNotificationEmail('email_new_ticket',$ticket_id,TRUE);

				//if a user has been assigned to this ticket, send a notification, but only if the user is not the person who created the ticket
				if($this->input->post('assigned_user_id') && $user->id != $this->input->post('assigned_user_id'))
				{
					//send notification of ticket assignment and link to ticket in admin area
				}

				$this->session->set_flashdata('success', lang('tickets:added'));
				redirect('admin/tickets');
			}
			else
			{
				$this->template->error = validation_errors();
			}
		}

		$users = $this->ion_auth->get_users();
        $users_select = array('' => __('milestones:select_assignee_default'));
        foreach ($users as $user) {
            $users_select[$user->id] = $user->first_name . ' ' . $user->last_name . ' (' . $user->username . ')';
        }

        $user = $this->ion_auth->get_user();

                $this->db->order_by('created', 'desc');
		$tickets = $this->ticket_m->select()->join_priority()->join_status()->join_client()->assigned_to($user->id, $this->ion_auth->is_admin())->get_all();
		foreach($tickets as &$ticket)
		{
			$this->ticket_m->get_latest_post($ticket);
                        $this->ticket_m->get_latest_history($ticket);
		}

		$data = array(
			'clients_dropdown' => client_dropdown('tickets', 'create_plus_update'),
			'users_select' => $users_select,
			'statuses' => $this->statuses->getDropdown(),
			'priorities' => $this->priorities->getDropdown(),
			'tickets' => $tickets,
		);

		$this->template->build('create', $data);
	}

	/**
	 * Add a reply to a ticket
	 * @param int $ticket_id
	 */
	public function reply($ticket_id)
	{
		$files = FALSE;
		$file = FALSE;

        can('read', get_client('tickets', $ticket_id), 'tickets', $ticket_id) or access_denied();

        if($_FILES){
        	$this->load->model('files/files_m','files');
        	$files = $this->files->upload($_FILES['ticketfile'], 'tickets');
        	if(is_array($files)){
        		$file = new stdClass;

        		foreach($files as $k=>$v){
        			$file->o_name = $k;
        			$file->r_name = $v['folder_name'] . $k;
        		}
        	}
        }

		if($_POST){
			$user = $this->ion_auth->get_user();

			$post_id = $this->ticket_post_m->insert(array(
				'ticket_id' => $ticket_id,
				'user_id' => $user->id,
				'orig_filename' => is_array($files) ? $file->o_name : '',
				'real_filename' => is_array($files) ? $file->r_name : '',
				'user_name' => $user->first_name.' '.$user->last_name,
				'message' => $this->input->post('message'),
				'created' => time(),
			));

			$this->ticket_m->sendNotificationEmail('email_ticket_updated',$ticket_id);
			if ($post_id)
			{
				$this->session->set_flashdata('success', lang('tickets:replied'));
				redirect('admin/tickets/view/'.$ticket_id);
			}
			else
			{
				$this->template->error = validation_errors();
				return $this->view($ticket_id);
			}
		}

		redirect('admin/tickets/view/'.$ticket_id);

	}

    function archive($ticket_id) {
        echo $this->ticket_m->archive($ticket_id) ? "SUCCESS" : "FAIL";
    }

    function unarchive($ticket_id) {
        echo $this->ticket_m->unarchive($ticket_id) ? "SUCCESS" : "FAIL";
    }

    /**
     * Edits a ticket
     *
     * @param int $ticket_id The id of the ticket
     */
    public function edit($ticket_id) {
        can('update', get_client('tickets', $ticket_id), 'tickets', $ticket_id) or access_denied();

        if ($_POST) {
            $user = $this->ion_auth->get_user();

            $data = array();

            $assigned_user_id = $this->input->post('assigned_user_id');

            $assigned_user_id = fix_assigned($assigned_user_id);
            $data['assigned_user_id'] = $assigned_user_id ? $assigned_user_id : null;

            if ($this->input->post('status_id')) {
                $data['status_id'] = $this->input->post('status_id');

                $this->ticket_history_m->insert(array(
                    'ticket_id' => $ticket_id,
                    'user_id' => $user->id,
                    'user_name' => $user->first_name . ' ' . $user->last_name,
                    'status_id' => $this->input->post('status_id'),
                    'created' => time(),
                ));
            }

            $ticket_human_value = $this->ticket_m->get_human_value($ticket_id);

            $this->ticket_m->update($ticket_id, $data, true);
            $this->ticket_m->sendNotificationEmail('email_ticket_status_updated', $ticket_id);
            $this->session->set_flashdata('success', __('tickets:edited', [$ticket_human_value]));

            # If the user has just lost the ability to view the ticket because they're no longer assigned to it...
            if (can('update', get_client('tickets', $ticket_id), 'tickets', $ticket_id)) {
                redirect('admin/tickets/view/' . $ticket_id);
            } else {
                redirect('admin/tickets');
            }
        }

        redirect('admin/tickets/view/' . $ticket_id);
    }

}

/* End of file: admin.php */