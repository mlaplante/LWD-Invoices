<?php 

use Pancake\Navigation;

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
 * All admin controllers should extend this library
 *
 * @subpackage	Controllers
 */
class Admin_Controller extends Pancake_Controller
{
	/**
	 * @var	array 	An array of methods to be secured by login
	 */
	protected $secured_methods = array('_all_');

	/**
	 * @var	array	The pagination class config array
	 */
	protected $pagination_config = array();

	/**
	 * @var	array   Admin controllers can have sections, normally an arbitrary string
	 */
	protected $section = NULL;

	// ------------------------------------------------------------------------

	/**
	 * The construct checks for authorization then loads in settings for
	 * all of the admin controllers.
	 *
	 * @access	public
	 * @return	void
	 */
	public function __construct()
	{
		parent::__construct();

		$this->benchmark->mark('admin_controller_construct_start');

		if ((in_array($this->method, $this->secured_methods) || in_array('_all_', $this->secured_methods)))
		{
			if ( ! logged_in() and $this->method != 'no_internet_access' and $this->method != 'backend_css' and $this->method != 'backend_js' and $this->method != 'setup_js')
			{
		    	$this->session->set_flashdata('login_redirect', $this->uri->uri_string());
				redirect('admin/users/login');
		    }

			// Be an admin or have access to this module a bit
			$module = $this->router->fetch_module();
			// if ( ! $this->ion_auth->is_admin() and (empty($this->permissions) or ($module !== 'dashboard' and empty($this->permissions[$module]))))
			// {
			// 	show_error('Permission Denied');
			// }
		}

		$this->load->library('form_validation');
                switch_theme(true);
		$this->template->set_layout('index');
		$this->template->set_partial('notifications', 'partials/notifications');
		$this->template->set_partial('search', 'partials/search');

		$this->template->module = $this->router->fetch_method() == 'estimates' ? 'estimates' : $this->router->fetch_module();

		// Active Admin Section (might be null, but who cares)
		$this->template->active_section = $this->section;

		// Setting up the base pagination config
		$this->pagination_config['per_page'] = Settings::get('items_per_page');
		$this->pagination_config['num_links'] = 5;
		$this->pagination_config['full_tag_open'] = '<ul>';
		$this->pagination_config['full_tag_close'] = '</ul>';
		$this->pagination_config['first_tag_open'] = '<li class="first">';
		$this->pagination_config['first_tag_close'] = '</li>';
		$this->pagination_config['last_tag_open'] = '<li class="last">';
		$this->pagination_config['last_tag_close'] = '</li>';
		$this->pagination_config['prev_tag_open'] = '<li class="prev">';
		$this->pagination_config['prev_tag_close'] = '</li>';
		$this->pagination_config['next_tag_open'] = '<li class="next">';
		$this->pagination_config['next_tag_close'] = '</li>';
		$this->pagination_config['cur_tag_open'] = '<li class="num"><strong>';
		$this->pagination_config['cur_tag_close'] = '</strong></li>';
		$this->pagination_config['num_tag_open'] = '<li class="num">';
		$this->pagination_config['num_tag_close'] = '</li>';

		// Try to determine the pagination base_url
		$segments = $this->uri->segment_array();

		if ($this->uri->total_segments() >= 4)
		{
			array_pop($segments);
		}

		$this->pagination_config['base_url'] = site_url(implode('/', $segments));
		$this->pagination_config['uri_segment'] = 4;

		if ($this->current_user) {
                    
                    # Fix unassigned items when there is only one user.
                    # The initial query just checks to see if there is only one user,
                    # and if there is, it counts unassigned items in every row.
                    # If the result is 0, only one query is run, thereby not really affecting performance.
                    
                    $count_unassigned_sql = "((select count(*) from ".$this->db->dbprefix("project_tasks")." where assigned_user_id != {$this->current_user->id} or assigned_user_id IS NULL) +
(select count(*) from ".$this->db->dbprefix("project_milestones")." where assigned_user_id != {$this->current_user->id} or assigned_user_id IS NULL) +
(select count(*) from ".$this->db->dbprefix("project_task_templates")." where assigned_user_id != {$this->current_user->id} or assigned_user_id IS NULL) +
(select count(*) from ".$this->db->dbprefix("tickets")." where assigned_user_id != {$this->current_user->id} or assigned_user_id IS NULL))";
		    $count_users_sql = "(select count(*) from ".$this->db->dbprefix("users").")";


                    $unassigned = $this->db->query("select IF($count_users_sql > 1, 0, $count_unassigned_sql) as count")->row_array();
                    $unassigned = $unassigned['count'];
                    
                    if ($unassigned > 0) {
                        // There is only one user AND there are unassigned items:
                        $tables = array(
                            'project_tasks',
                            'project_milestones',
                            'project_task_templates',
                            'tickets',
                        );
                        
                        foreach ($tables as $table) {
                            $this->db->where("assigned_user_id != {$this->current_user->id}", null, false);
                            $this->db->or_where("assigned_user_id IS NULL", null, false);
                            $this->db->update($table, array('assigned_user_id' => $this->current_user->id));
                        }
                        
                    }

                    $this->template->update_counter = $this->update->count_available_updates();

                    $this->user_m->track_last_activity();
            
        }
        
        $this->template->navbar = Navigation::getNavbarLinks();

                $this->load->model('users/assignments');
                $this->assignments->process_assign_postdata();

                log_message('debug', "Admin_Controller Class Initialized");

		$this->benchmark->mark('admin_controller_construct_end');
	}

}

/* End of file: Admin_Controller.php */
