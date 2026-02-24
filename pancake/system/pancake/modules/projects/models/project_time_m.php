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
class Project_time_m extends Pancake_Model
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
	protected $validate = array(
		array(
			'field'	  => 'project_id',
			'label'	  => 'Project',
			'rules'	  => 'required'
		),
		array(
			'field'	  => 'start_time',
			'label'	  => 'times.label.start_time',
			'rules'	  => 'required|max_length[8]'
		),
		array(
			'field'	  => 'end_time',
			'label'	  => 'times.label.end_time',
			'rules'	  => 'required|max_length[8]'
		),
		array(
			'field'	  => 'date',
			'label'	  => 'times.label.date',
			'rules'	  => ''
		),
		array(
			'field'	  => 'task_id',
			'label'	  => 'times.label.task_id',
			'rules'	  => ''
		),
		array(
			'field'	  => 'note',
			'label'	  => 'times.label.note',
			'rules'	  => ''
		),
	);

	// --------------------------------------------------------------------

	/**
	 * Retrieves the time sub-times with a given task id
	 *
	 * @access	public
	 * @return	object	The result object
	 */
	public function get_times_by_project($project_id = null)
	{
        $task_time_interval = process_hours(Settings::get('task_time_interval')) * 60;
        $rounded_minutes = $this->get_rounded_minutes_sql();

            where_assigned('project_tasks', 'read', 'task_id', 'project_times');
		return $this->db
			->select("{$this->times_table}.*, users.username, users.email, meta.first_name, meta.last_name, $rounded_minutes")
			->join('users', 'users.id = project_times.user_id')
			->join('meta', 'meta.user_id = project_times.user_id')
			->where('project_id', $project_id)
			->where('end_time !=', '')
			->get($this->times_table)
			->result();
	}
	
	public function get_task_entries_by_task($task_id = null)
	{
        $task_time_interval = process_hours(Settings::get('task_time_interval')) * 60;
        $rounded_minutes = $this->get_rounded_minutes_sql();

            where_assigned('project_tasks', 'read', 'task_id', 'project_times');
		return $this->db
			->select("{$this->times_table}.*, users.username, users.email, meta.first_name, meta.last_name, $rounded_minutes")
			->join('users', 'users.id = project_times.user_id')
			->join('meta', 'meta.user_id = project_times.user_id')
			->where('task_id', $task_id)
			->where('end_time !=', '')
			->get($this->times_table)
			->result();
	}

	public function get_all_active_timers()
	{
            where_assigned('project_tasks', 'read', 'task_id', 'project_times');
		return $this->db
			->select('project_times.*, project_tasks.*, projects.name as project_name')
			->where('project_times.end_time', '')
			->join('project_tasks', 'project_tasks.id = project_times.task_id')
			->join('projects', 'projects.id = project_times.project_id')
			->get($this->times_table)
			->result();
	}

	public function get_all_timers_by_project()
	{
            where_assigned('project_tasks', 'read', 'task_id', 'project_times');
		return $this->db
			->select('project_times.*, project_tasks.*, projects.name as project_name')
			->join('project_tasks', 'project_tasks.id = project_times.task_id')
			->join('projects', 'projects.id = project_times.project_id')
			->get($this->times_table)
			->result();
	}

    public function get_all_hours_worked($since = null) {
        where_assigned('project_tasks', 'read', 'task_id', 'project_times');

        if ($since !== null) {
            $this->db->where("date >", $since);
        }

        $rounded_minutes = $this->project_time_m->get_rounded_minutes_sql(null);
        $ret = $this->db->select("sum(minutes) as minutes, sum($rounded_minutes) as rounded_minutes")->get($this->times_table)->row();
        return [
            "hours" => $ret->minutes / 60,
            "rounded_hours" => $ret->rounded_minutes / 60,
        ];
    }

	public function active_timer_count()
	{
		return count($this->get_all_active_timers());
	}

	public function get_all_timers_grouped()
	{
		$this->load->model('projects/project_m');
		$this->load->model('projects/project_task_m');
		$projects = $this->project_m->get_open_projects();

		foreach ($projects as $key => $project) {
                        $project->tasks = $this->project_task_m->get_tasks_by_project($project->id, null, null, null, true);
			$project->tasks = $this->project_task_m->get_tasks_and_times_by_project($project->id, 1000, 0, true, null, null, true);
			
                        foreach ($project->tasks as $task_key => $task) {
                            if ($task['id'] == 0) {
                                unset($project->tasks[$task_key]);
                            }
                        }

                        if (!count($project->tasks))
			{
				unset($projects[$key]);
			}
			else
			{
				$projects[$key] = $project;
			}
		}

		return $projects;
	}

    public function get_rounded_minutes($minutes) {
        // Convert task time interval to minutes for ceiling calculation.
        $task_time_interval = process_hours(Settings::get('task_time_interval')) * 60;
        if ($task_time_interval > 0) {
            return (ceil(round($minutes) / $task_time_interval) * $task_time_interval);
        } else {
            return $minutes;
        }
    }

    public function get_rounded_minutes_sql($field_name = "rounded_minutes") {
        // Convert task time interval to minutes for ceiling calculation.
        $task_time_interval = process_hours(Settings::get('task_time_interval')) * 60;
        if ($task_time_interval > 0) {
            return "(CEILING(round(minutes) / $task_time_interval) * $task_time_interval)" . ($field_name ? "as $field_name" : "");
        } else {
            return "minutes" . ($field_name ? " as $field_name" : "");
        }
    }
        
        public function get_for_billing($existing_invoice_rows) {
            
            if (!in_array(0, $existing_invoice_rows)) {
                $existing_invoice_rows[] = 0;
            }
            
            static $time_entries = array();

            $rounded_minutes = $this->get_rounded_minutes_sql("rounded_minutes");
            
            if (empty($time_entries)) {
                $buffer = $this->db
                        ->select("CONCAT(first_name, ' ', last_name) as user_display_name, md5(email) as email_md5, ".$this->db->dbprefix("project_times").".id, project_id, task_id, ".$this->db->dbprefix("project_times").".user_id, start_time, end_time, minutes, $rounded_minutes, date, note", false)
                        ->join('users', 'users.id = project_times.user_id', 'left')
                        ->join('meta', 'meta.user_id = users.id', 'left')
                        ->where_in('invoice_item_id', $existing_invoice_rows)->get('project_times')->result_array();
                
                foreach ($buffer as $row) {
                    $row['date'] = format_date($row['date']);
                    $row['duration'] = format_hours($row['minutes'] / 60);
                    $row['rounded_duration'] = format_hours($row['rounded_minutes'] / 60);
                    $row['start_time'] = format_time(strtotime($row['start_time']));
                    $row['end_time'] = format_time(strtotime($row['end_time']));
                    
                    if (!isset($time_entries[(int) $row['project_id']])) {
                        $time_entries[(int) $row['project_id']] = array();
                    }
                    
                    if (!isset($time_entries[(int) $row['project_id']][(int) $row['task_id']])) {
                        $time_entries[(int) $row['project_id']][(int) $row['task_id']] = array();
                    }

                    $time_entries[(int) $row['project_id']][(int) $row['task_id']][(int) $row['id']] = $row;
                }
            }
            
            return $time_entries;
        }
        
        function mark_as_billed($row_id, $ids) {
            if (!empty($ids)) {
                return $this->db->where_in('id', $ids)->update('project_times', array('invoice_item_id' => $row_id));
            }
        }
        
        function mark_as_unbilled($row_ids) {
            if (!is_array($row_ids)) {
                $row_ids = array($row_ids);
            }
            if (!empty($row_ids)) {
                return $this->db->where_in('invoice_item_id', $row_ids)->update('project_times', array('invoice_item_id' => '0'));
            }
        }

	/**
	 * Retrieves the times that have no task assigned
	 *
	 * @access	public
	 * @return	object	The result object
	 */
	public function get_extras_by_project($project_id = null)
	{
		$this->db->where('task_id', 0);
		return $this->get_times_by_project($project_id);
	}

	// --------------------------------------------------------------------

	/**
	 * Inserts a new time
	 *
	 * @access	public
	 * @param	array 	The time array
	 * @return	int
	 */
	public function insert($input, $skip_validation = false)
	{
		if (isset($input['date']) && !empty($input['date'])) {
			$date = carbon($input['date']);
		} else {
			$date = now();
		}

		$date = $date->timestamp;

		return parent::insert(array(
			'project_id'	=> $input['project_id'],
			'start_time'	=> ! empty($input['start_time']) ? $input['start_time'] : '',
			'end_time'		=> ! empty($input['end_time']) ? $input['end_time'] : '',
			'date'			=> $date,
			'note'			=> ! empty($input['note']) ? $input['note'] : '',
			'task_id'		=> ! empty($input['task_id']) ? $input['task_id'] : 0,
			'user_id'		=> $input['user_id'],
			'minutes' => isset($input['minutes']) ? $input['minutes'] : ceil((strtotime($input['end_time']) - strtotime($input['start_time'])) / 60)
		), $skip_validation);
	}

        function insert_hours($project_id, $date, $hours, $task_id = 0, $notes = '', $start_time = null, $user_id = null) {
            
            if ($user_id === null) {
                $user_id = $this->current_user->id;
            }
            
            $data = array(
                'project_id' => $project_id,
                'note' => $notes,
                'date' => 0,
                'minutes' => 0,
                'end_time' => 0,
                'start_time' => 0,
                'task_id' => $task_id,
                'user_id' => $user_id,
            );

            if ($hours == 0) {
                # Ignore entry.
                return true;
            }

            /*$hours_today = date('H');
            $hours_before_today = $hours - $hours_today;

            if ($hours_before_today > 0) {
                # Add all hours for today.

                $data['date'] = $date;
                $data['minutes'] = ($hours_today * 60);
                $data['start_time'] = '00:00';
                $data['end_time'] = date('H') . ':00';
                $this->project_time_m->insert($data);

                $days_before = 1;
                while ($hours_before_today > 0) {

                    $data['date'] = strtotime("-{$days_before} days", $date);

                    if ($hours_before_today > 24) {
                        # Add 24 hours to today - $days_before.
                        $data['minutes'] = (24 * 60);
                        $data['start_time'] = '00:00';
                        $data['end_time'] = '00:00';
                        $this->project_time_m->insert($data);
                        $hours_before_today = $hours_before_today - 24;
                    } else {
                        # Add $hours_before_today hours to today - $days_before.
                        $data['minutes'] = ($hours_before_today * 60);
                        $data['start_time'] = date('H:i', strtotime('-' . $hours_before_today . ' hours', strtotime('+1 day', mktime(00, 00, 00, date('n', $data['date']), date('j', $data['date']), date('Y', $data['date'])))));
                        $data['end_time'] = '00:00';
                        $this->project_time_m->insert($data);
                        $hours_before_today = $hours_before_today - 24;
                    }
                }
            } else {
                $data['date'] = $date;
                $data['minutes'] = $hours * 60;
                $data['start_time'] = date('H:i', strtotime('-' . $hours . ' hours'));
                $data['end_time'] = date('H:i');
                $this->project_time_m->insert($data);
            }*/

			$minutes = round($hours * 60);
			$seconds = round($hours * 60 * 60);

			if (!empty($date)) {
				$date = carbon($date);
			} else {
				$date = now();
			}

			$data['date'] = $date;
			$data['minutes'] = $minutes;
			if ($start_time) {
				$start_time = strtotime(date('Y-m-d', $date->timestamp) . ' ' . $start_time);
				$end_time = strtotime('+' . $seconds . ' seconds', $start_time);
			} else {
				$end_time = time();
				$start_time = strtotime('-' . $seconds . ' seconds', $end_time);
			}
			$data['start_time'] = date('H:i', $start_time);
			$data['end_time'] = date('H:i', $end_time);
			$this->project_time_m->insert($data);
        }
        
        /**
         * Inserts time into the database, expecting fully-processed input,
         * and requiring as little of it as possible.
         * That means no carbon(), no strtotime, nothing. Just insert.
         * 
         * It fetches current user and project id automatically.
         * 
         */
        function insert_time_raw($task_id, $start_timestamp, $seconds, $user_id, $note = '') {
            if ($task_id > 0) {
                $buffer = $this->db->select('project_id')->where('id', $task_id)->get('project_tasks')->row_array();
                $project_id = $buffer['project_id'];
                unset($buffer);
            } else {
                $project_id = 0;
            }
            
            if ($seconds == 0) {
                return true;
            }
            
            $data = array(
                'project_id' => $project_id,
                'task_id' => $task_id,
                'user_id' => $user_id,
                'start_time' => date('H:i', $start_timestamp),
                'end_time' => date('H:i', $start_timestamp + $seconds),
                'minutes' => $seconds / 60,
                'date' => mktime(0, 0, 0, date('n', $start_timestamp), date('j', $start_timestamp), date('Y', $start_timestamp)),
                'note' => $note
            );
            
            return $this->db->insert('project_times', $data);
        }

	/**
	 * Get the logged time for any given task.
	 *
	 * If $hours, the number is in hours. Otherwise, it's in minutes.
	 *
	 * @param integer $project_id
	 * @param integer $task_id
	 * @param boolean $hours
	 * @return double
	 */
	public function get_tracked_task_time($project_id, $task_id, $hours = false)
	{
            
            if (!can('read', get_client('projects', $project_id), 'project_tasks', $task_id)) {
                return array(
                    'records' => array(),
                    'time' => 0
                );
            }
            
	    if ($project_id > 0)
		{
	        $this->db->where('project_id', $project_id);
	    }
	    $task_time = $this->db
			->select('sum(minutes) as tracked_task_time')
			->where('task_id', $task_id)
			->where('end_time !=', '')
			->get($this->times_table)
			->row_array();

		$total_time = $hours ? round($task_time['tracked_task_time'] / 60, 2) : $task_time['tracked_task_time'];

		$task_time = $this->db
			->select("{$this->times_table}.*, users.username, meta.first_name, meta.last_name")
			->join('users', 'users.ID = project_times.user_id')
			->join('meta', 'meta.user_id = project_times.user_id')
			->where('end_time !=', '')
			->where('project_id', $project_id)
			->where('task_id', $task_id)
			->get($this->times_table)
			->result_array();

	    return array(
	        'records' => $task_time,
	        'time' => $total_time
	    );
	}

        function get_concatenated_time_entry_notes($project_id) {
            $project_id = (int) $project_id;
            $buffer = $this->db->query("select task_id, group_concat(note separator '\n\n---\n\n') as notes from ".$this->db->dbprefix("project_times")." where note != '' and project_id = $project_id group by task_id;")->result_array();
            $return = array();
            foreach ($buffer as $row) {
                $return[$row['task_id']] = $row['notes'];
            }
            return $return;
        }

}

/* End of file: project_time_m.php */