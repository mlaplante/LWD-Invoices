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
 * The Project Task Model
 *
 * @subpackage	Models
 * @category	Payments
 */
class Project_milestone_m extends Pancake_Model
{
	/**
	 * @var	string	The projects table name
	 */
	protected $projects_table = 'projects';

	/**
	 * @var	string	The projects table name
	 */
	protected $milestones_table = 'project_milestones';

	/**
	 * @var	array	The array of validation rules
	 */
	protected $validate = array(
		array(
			'field'	  => 'project_id',
			'label'	  => 'lang:global:project',
			'rules'	  => 'required',
		),
		array(
			'field'	  => 'name',
			'label'	  => 'lang:global:name',
			'rules'	  => 'required',
		),
		array(
			'field'	  => 'description',
			'label'	  => 'lang:global:description',
			'rules'	  => ''
		),
		array(
			'field'	  => 'assigned_user_id',
			'label'	  => 'lang:milestones:assigned_user',
			'rules'	  => 'numeric',
		),
		array(
			'field'	  => 'color',
			'label'	  => 'lang:milestones:color',
			'rules'	  => '',
		),
		array(
			'field'	  => 'target_date',
			'label'	  => 'lang:milestones:target_date',
			'rules'	  => '',
		),
	);

    function get_new_order($project_id) {
        $row = $this->db->select_max("order", "new_order")->where("project_id", $project_id)->get($this->milestones_table)->row_array();
        return ($row['new_order'] + 1);
    }

    public function insert($data, $skip_validation = FALSE) {
        if (!isset($data['order'])) {
            $data['order'] = $this->get_new_order($data['project_id']);
        }

        return parent::insert($data, $skip_validation);
    }


    public function set_assigned_user($milestone_id, $assigned_user_id) {

                $assigned_user_id = fix_assigned($assigned_user_id);
            
		// special case to null, don't send email, quick return
		if ($assigned_user_id == "" || !is_numeric($assigned_user_id))
		{
			$assigned_user_id = null;
			$this->update($milestone_id, array('assigned_user_id' => $assigned_user_id));
			return true;
		}

		$user = $this->ion_auth->get_user($assigned_user_id);
		if (!$user) return false;

		$this->update($milestone_id, array('assigned_user_id' => $assigned_user_id));
                
                if (current_user() != $assigned_user_id) {
                    $milestone = $this->db->where('id', $milestone_id)->get('project_milestones')->row_array();
                    $milestone['target_date'] = empty($milestone['target_date']) ? __('global:na') : format_date($milestone['target_date']);
                    $project = $this->db->where('id', $milestone['project_id'])->get('projects')->row_array();
                    Pancake\Email\Email::send(array(
                        'to' => $user->email,
                        'template' => 'assigned_to_milestone',
                        'client_id' => $project['client_id'],
                        'data' => array(
                            'milestone' => $milestone,
                            'project' => $project
                        ),
                    ));
                }

		return true;
	}

	// todo, write this method to inherit from parent
	// public function update($primary_value, $data, $skip_validation = FALSE)
	// {

	// }

	// --------------------------------------------------------------------

	/**
	 * Retrieves the milestone sub-milestones with a given milestone id
	 *
	 * @access	public
	 * @param	int		The amount of results to return
	 * @param	int		The offset to start from
	 * @return	object	The result object
	 */
	public function get_milestones_by_project($project_id = null)
	{
		return $this->db
			->select($this->milestones_table.'.*')
			->where($this->db->dbprefix($this->milestones_table).'.project_id', $project_id, false)
			//->order_by('completed ASC')
			->get($this->milestones_table)
			->result();
	}
        
        function get_milestones($ids) {
            $milestones = array();
            if (isset($ids[0])) {
                $milestones[0] = array(
                    'id' => 0,
                    'name' => 'No Milestone',
                    'description' => '',
                    'project_id' => $ids[0]
                );
            }
            
            if (!empty($ids)) {
                $buffer = $this->db->select('id, name, description, project_id')->where_in('id', array_keys($ids))->get($this->milestones_table)->result_array();
                foreach ($buffer as $row) {
                    $milestones[$row['id']] = $row;
                }
            }
            return $milestones;
        }

	// --------------------------------------------------------------------

	/**
	 * Retrieves a certain number of upcoming milestones
	 *
	 * @access	public
	 * @param	int		The tast id
	 * @return	object	The result object
	 */
	public function get_upcoming_milestones($count = 5)
	{
		$this->db
			->select('project_milestones.*, projects.name as project_name')
			->join('projects', 'project_milestones.project_id = projects.id')
			->where('project_milestones.completed', 0)
			->limit($count)
        	->order_by('target_date DESC');

		return $this->db->get($this->milestones_table)->result();
	}
        
        public function get_completion_percent($milestone_id) {
            $this->load->model('project_task_m');
            $total_tasks = $this->project_task_m->count_all_tasks(null, $milestone_id);
            if( $total_tasks != 0 ) {
                $incomplete_tasks = $this->project_task_m->count_all_incomplete_tasks(null, $milestone_id);
                $complete_tasks = $total_tasks - $incomplete_tasks;
                return round(number_format(($complete_tasks / $total_tasks) * 100, 1));
            } else {
                return 0;
            }
        }
        
        function update_order($project_id, $ids) {
            $data = array();
            foreach ($ids as $order => $id) {
                $data[] = array(
                    "id" => $id,
                    "order" => $order
                );
            }
            $this->db->where("project_id", $project_id);
            $this->db->update_batch($this->milestones_table, $data, "id");
            return true;
        }
        
        public function search($query, $project_id) {
            
            if ($project_id == 0) {
                # Cannot search globally for milestones, you need a project ID.
                return array();
            }
            
            $clients = $this->db->where('project_id', $project_id)->select('id, name')->get($this->milestones_table)->result_array();

            $buffer = array();
            $details = array();
            $query = strtolower($query);

            foreach ($clients as $row) {
                $subbuffer = array();
                $subbuffer[] = levenshtein($query, strtolower($row['name']), 1, 20, 20);

                sort($subbuffer);

                $buffer[$row['id']] = reset($subbuffer);
                $details[$row['id']] = $row['name'];
            }

            asort($buffer);
            $return = array();

            foreach (array_slice($buffer, 0, 3, true) as $id => $levenshtein) {
                $return[] = array(
                    'levenshtein' => $levenshtein,
                    'name' => $details[$id],
                    'id' => $id
                );
            }

            return $return;
        }

}

/* End of file: project_milestone_m.php */