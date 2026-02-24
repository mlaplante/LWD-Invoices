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
 * The admin controller for Emails
 *
 * @subpackage	Controllers
 * @category	Email Templates
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
		$this->load->model('emails_m');
                
                is_admin() or access_denied();

	}

	// ------------------------------------------------------------------------

        function index() {
            redirect("admin/invoices/reminders");
        }
        
        /**
	 * Loads all the Email Templates
	 *
	 * @access	public
	 * @return	void
	 */
	public function all($offset = 0)
	{
        
		$email_templates = $this->emails_m->order_by('name')->get_all();

		$data = array(
			'templates'	=> $email_templates,
		);
		
      
		$this->template->build('all', $data);
	}

	/**
	 * Creates an email template
	 *
	 * @access	public
	 * @return	void
	 */
	public function create()
	{

		if ($_POST)
		{
			$_POST['created'] = time();

            $postBuffer = $_POST;

            if (empty($postBuffer['days'])) {
                $postBuffer['days'] = 0;
            }

			if ($result = $this->emails_m->insert($postBuffer))
			{
				$this->session->set_flashdata('success', lang('emailtemplates:added'));
				redirect('admin/emails/all');
			}
			else
			{
				$this->template->error = validation_errors();
			}
		}
		$this->template->action_type = 'add';
		$this->template->action = 'create';
		$this->template->build('form');
	}

	// ------------------------------------------------------------------------

	/**
	 * Edits an email template
	 *
	 * @access	public
	 * @return	void
	 */
	public function edit($email_id)
	{
		

		if ( ! $email = $this->emails_m->get($email_id))
		{
			$this->session->set_flashdata('error', lang('emailtemplates:does_not_exist'));
			redirect('admin/emails/all');
		}

		//$email_templates = $this->emails_m->order_by('name')->get_all();

		if ($_POST)
		{
			$postBuffer = $_POST;


			if ($result = $this->emails_m->update($email_id, $postBuffer))
			{
				$this->session->set_flashdata('success', lang('emailtemplates:edited'));
				redirect('admin/emails/all');
			}
			else
			{
				$this->template->error = validation_errors();
			}
		}
		else
		{
			$email->content = str_replace(array('\n', '\"'), array("\n", '"'), $email->content);
			foreach ((array) $email as $key => $val)
			{
				$_POST[$key] = $val;
			}
		}
		$this->template->action_type = 'edit';
        $this->template->email_id = $email_id;
		$this->template->action = 'edit/'.$email_id;
		$this->template->build('form');
	}

	// ------------------------------------------------------------------------

	/**
	 * Deletes an Email Template
	 *
	 * @access	public
	 * @return	void
	 */
	public function delete($email_id)
	{

		if ($_POST)
		{
			// Check to make sure the action hash matches, if not kick em' to the curb
			if ($this->input->post('action_hash') !== $this->session->userdata('action_hash'))
			{
				$this->session->set_flashdata('error', lang('global:insecure_action'));
				redirect('admin/emails/all');
			}

            # This deletes all invoices, projects and proposals related to the client.
			$this->emails_m->delete($email_id);
			$this->session->set_flashdata('success', lang('emailtemplates:deleted'));
			redirect('admin/emails/all');
		}

		// We set a unique action hash here to stop CSRF attacks (hacker's beware)
		$action_hash = md5(time().$email_id);
		$this->session->set_userdata('action_hash', $action_hash);
		$this->template->action_hash = $action_hash;

		// Lets make sure before we just go killing stuff like Rambo
		$this->template->email_id = $email_id;
		$this->template->build('are_you_sure');
	}


}

/* End of file: admin.php */