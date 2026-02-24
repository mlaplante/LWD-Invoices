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
 * @since		Version 1.1
 */

// ------------------------------------------------------------------------

/**
 * The Project Time Model
 *
 * @subpackage	Models
 * @category	Payments
 */
class Timesheet_m extends Pancake_Model
{
	/**
	 * @var	string	The projects table name
	 */
	protected $projects_table = 'projects';

	/**
	 * @var string	The times table
	 */
	protected $times_table = 'project_times';

	/**
	 * @var	array	The array of validation rules
	 */
	protected $validate = array();

	// --------------------------------------------------------------------

	/**
	 * Retrieves the time sub-times with a given task id
	 *
	 * @access	public
	 * @return	object	The result object
	 */
	public function build_timesheet($user=null, $start_time=null, $end_time=null)
	{


			if($user){ 
				$this->db->where('users.id', $user);
			};

			if($start_time){ 
				$this->db->where('date >=', strtotime($start_time));
			};

			if($end_time){ 
				$this->db->where('date <=', strtotime($end_time));
			};

        $this->load->model("projects/project_time_m");
        $rounded_minutes = $this->project_time_m->get_rounded_minutes_sql();

        where_assigned('project_tasks', 'read', 'task_id', 'project_times');
		return $this->db
			->select("{$this->times_table}.*, users.username, users.email, projects.name as project_name, clients.company as company, clients.id as client_id, meta.first_name, meta.last_name, project_tasks.name as task_name, $rounded_minutes")
			->join('users', 'users.id = project_times.user_id')
			->join('meta', 'meta.user_id = project_times.user_id')
			->join('projects', 'projects.id = project_times.project_id')
			->join('project_tasks', 'project_tasks.id = project_times.task_id', 'left')
			->join('clients', 'clients.id = projects.client_id')
			->where('end_time !=', '')
			->get($this->times_table)
			->result();
	}
	

}

/* End of file: project_time_m.php */