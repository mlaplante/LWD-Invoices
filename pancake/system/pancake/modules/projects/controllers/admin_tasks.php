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

/**
 * The admin controller for tasks
 *
 * @subpackage	Controllers
 * @category	Projects
 */
class Admin_Tasks extends Admin_Controller {

	/**
	 * Load in the dependencies
	 *
	 * @access	public
	 * @return	void
	 */
	public function __construct()
	{
		parent::__construct();

		$this->load->model(array(
			'project_m', 'project_task_m',
			'project_time_m', 'project_milestone_m',
		));

        $this->load->model('project_task_statuses_m','statuses');
	}

	public function index()
	{
		access_denied();
	}

	public function create($project_id = null, $milestone_id = null)
	{
		IS_AJAX or access_denied();

		if ($_POST)
		{
                    
                    can('create', $this->project_m->getClientIdById($project_id), 'project_tasks') or access_denied();
                    
			$result = $this->project_task_m->insert_task($_POST);

            if ($result && $this->input->post('assigned_user_id')) {
                $insert_id = $this->db->insert_id();
                $result = $this->project_task_m->set_assigned_user($insert_id, $this->input->post('assigned_user_id'));
            }

			// All form validation is handled in the model, so lets just throw it the data
			if ($result)
			{
				$message = array('success' => __('tasks:create_succeeded'));
			}
			else
			{
				if ($errors = validation_errors('<p>', '</p>'))
				{
					$message = array('error' => $errors);
				}
				else
				{
					$message = array('error' => __('tasks:create_failed'));
				}
			}

			output_json($message);
		}

		$milestones = $this->project_milestone_m->get_milestones_by_project($project_id);
		$project = $this->project_m->get_project_by_id($project_id)->row();

		$milestones_select = array(lang('milestones:select_default'));
		foreach ($milestones as $milestone)
		{
			$milestones_select[$milestone->id] = $milestone->name;
		}

        $users = $this->ion_auth->get_users();
        $users_select = array('' => __('milestones:select_assignee_default'));
        foreach ($users as $user) {
            $users_select[$user->id] = $user->first_name . ' ' . $user->last_name . ' (' . $user->username . ')';
        }

        $tasks = $this->project_task_m->get_toplevel_tasks($project_id);
        $tasks_select = array('' => __('tasks:select_parent_default'));
        foreach ($tasks as $task) {
        	$tasks_select[$task['id']] = $task['name'];
        }

		$this->load->view('task_form', array(
			'project' => $project,
            'task_statuses' => $this->statuses->getDropdown(),
			'milestones_select' => $milestones_select,
			'tasks_select' => $tasks_select,
			'milestone_id' => $milestone_id,
			'parent_task_id' => $this->input->get('parent_id'), // TODO
			'action' => 'create',
			'users_select' => $users_select
		));
	}

	public function edit($task_id = null)
	{
		can('update', $this->project_task_m->getClientIdById($task_id), 'project_tasks', $task_id) or access_denied();

		$task = $this->project_task_m->get($task_id);

		if ($_POST)
		{
			// All form validation is handled in the model, so lets just throw it the data
            $_POST['is_viewable'] = isset($_POST['is_viewable']);
            $_POST['is_timesheet_viewable'] = isset($_POST['is_timesheet_viewable']);

			if (isset($_POST['due_date']) && !empty($_POST['due_date'])) {
				$_POST['due_date'] = carbon($_POST['due_date'])->timestamp;
			} else {
				$_POST['due_date'] = 0;
			}

                        $_POST['parent_id'] = (int) $_POST['parent_task_id'];
                        unset($_POST['parent_task_id']);
                            
			$result = $this->project_task_m->update($task_id, $_POST);

			if ($result && $this->input->post('assigned_user_id') != $task->assigned_user_id) {
                $result = $this->project_task_m->set_assigned_user($task_id, $this->input->post('assigned_user_id'));
            }

            $_POST['projected_hours'] = time_to_decimal($_POST['projected_hours']);

			if ($result = $this->project_task_m->update($task_id, $_POST)) {
                            $this->session->set_flashdata('success', __('tasks:edit_succeeded'));
                            
                            $data = array(
                                'task_id' => $task_id,
                                'project_id' => $task->project_id
                            );
                            
                            if ($this->input->post('milestone_id') > 0) {
                                $data['milestone_id'] = $this->input->post('milestone_id');
                            }

                            $redirect_url = $this->dispatch_return('generate_redirect_url_after_task_edited', $data);

                            if (is_array($redirect_url)) {
                                // Plugin is not installed, use default:
								if (isset($_SERVER['HTTP_REFERER'])) {
									$redirect_url = $_SERVER['HTTP_REFERER'];
								} else {
									$redirect_url = 'admin/projects/view/' . $task->project_id;
								}

                            };

                            redirect($redirect_url);
                            
                        } elseif ($errors = validation_errors('<p>', '</p>')) {
                            $this->template->error = validation_errors();
                        } else {
                            $this->session->set_flashdata('error', __('tasks:edit_failed'));
                        }
		}
		else
		{
			foreach ((array) $task as $key => $val)
			{
				$_POST[$key] = $val;
			}
		}

		$milestones = $this->project_milestone_m->get_milestones_by_project($task->project_id);
		$project = $this->project_m->get_project_by_id($task->project_id)->row();

		$milestones_select = array(__('milestones:select_default'));
		foreach ($milestones as $milestone)
		{
			$milestones_select[$milestone->id] = $milestone->name;
		}

        $users = $this->ion_auth->get_users();
        $users_select = array('' => __('milestones:select_assignee_default'));
        foreach ($users as $user) {
            $users_select[$user->id] = $user->first_name . ' ' . $user->last_name . ' (' . $user->username . ')';
        }

        $tasks = $this->project_task_m->get_toplevel_tasks($project->id);
        $tasks_select = array('' => __('tasks:select_parent_default'));
        foreach ($tasks as $_task) {
        	$tasks_select[$_task['id']] = $_task['name'];
        }

		$this->load->view('task_form', array(
			'project' => $project,
			'milestones_select' => $milestones_select,
            'task_statuses' => $this->statuses->getDropdown(),
			'task' => $task,
			'tasks_select' => $tasks_select,
			'action' => 'edit',
			'parent_task_id' => $task->parent_id,
			'users_select' => $users_select
		));
	}

	public function get_delete_form($task_id)
	{
            can('delete', $this->project_task_m->getClientIdById($task_id), 'project_tasks', $task_id) or access_denied();
		$this->load->view('delete_task', array('task_id' => $task_id));
	}

	public function delete($task_id)
	{
		can('delete', $this->project_task_m->getClientIdById($task_id), 'project_tasks', $task_id) or access_denied();

		// delete task. Ajax Only.
		$task = $this->project_task_m->get_task_by_id($task_id);

		if (!$task || $task->num_rows() == 0)
		{
			$message = array('error' => 'Invalid Object');
            $redirect = '/admin/projects';
		}
		else
		{
			$message = array('success' => 'Deleted Object');
			$this->project_task_m->delete($task_id);
            $task = $task->row();
            $redirect = '/admin/projects/view/' . $task->project_id;
		}

		if (IS_AJAX) {
            output_json($message);
        }

		redirect($redirect);
	}
        
        function quick_add() {
            if (filter_has_var(INPUT_POST, 'name')) {
                $name = filter_input(INPUT_POST, 'name', FILTER_SANITIZE_STRING);
                $project_id = filter_input(INPUT_POST, 'project_id', FILTER_VALIDATE_INT);
                $milestone_id = filter_input(INPUT_POST, 'milestone_id', FILTER_VALIDATE_INT);
                $assigned_user_id = filter_input(INPUT_POST, 'assigned_user_id', FILTER_VALIDATE_INT);
                if ($this->project_task_m->quick_add($name, $project_id, $milestone_id, $assigned_user_id)) {
                    echo "OK";
                } else {
                    echo "NO";
                }
            } else {
                echo "NO";
            }
        }
        
        function update_position() {
            if (filter_has_var(INPUT_POST, 'tasks_order')) {
                $this->project_task_m->update_order($_POST['tasks_order']);
            }
            
            if (filter_has_var(INPUT_POST, 'task_id')) {
                $task_id = filter_input(INPUT_POST, 'task_id', FILTER_VALIDATE_INT);
                $parent_id = filter_input(INPUT_POST, 'parent_id', FILTER_VALIDATE_INT);
                $milestone_id = filter_input(INPUT_POST, 'milestone_id', FILTER_VALIDATE_INT);
                if ($this->project_task_m->update_position($task_id, $parent_id, $milestone_id)) {
                    echo "OK";
                } else {
                    echo "NO";
                }
            } else {
                echo "NO";
            }
        }

	public function set_status($is_completed, $is_dashboard_row, $task_id)
	{
            $is_completed = ($is_completed == "true");
            $is_dashboard_row = ($is_dashboard_row == "true");
            
		// toggle completion status. Ajax Only
		$task = $this->project_task_m->get_task_by_id($task_id);
		$task = $task->row_array();

                if (!isset($task['project_id'])) {
                    # Redirect. jQuery.load() will take care of fetching the updated row. Hacky, but it fixes the bug. - Bruno.
                    redirect('admin/projects/view/'.$task['project_id']);
                }
                
                if (current_user() != $task['assigned_user_id']) {
                    can('update', $this->project_task_m->getClientIdById($task_id), 'project_tasks', $task_id) or redirect('admin/projects/view/'.$task['project_id']);
                }
                
		$task['completed'] = $is_completed;
                
                if ($task['completed']) {
                    // Reset task's status. If the task is "In Progress" or "Pending",
                    // and the user has just marked it as complete, the status should be reset.
                    $task['status_id'] = 0;
                }

		// sets the due date to today if it's not already set and if the task is completed.
		if(empty($task['due_date']) && $task['completed']) $task['due_date'] = time();

		// update the model
		$this->project_task_m->update_task($task, true);

		if ($task['completed'])
		{

			$current_user = $this->ion_auth->get_user();
			// Save it to the notification table
			$this->load->model('notifications/notification_m');
                        Notify::user_completed_task($task['id'], $current_user->id);

			$this->project_task_m->complete_task_children($task['id']);
		}

		# Redirect. jQuery.load() will take care of fetching the updated row. Hacky, but it fixes the bug. - Bruno.
                
                if ($is_dashboard_row) {
                    redirect('admin');
                } else {
                    redirect('admin/projects/view/'.$task['project_id']);
                }
	}

	public function discussion($item_id) {
	    redirect("admin/discussions/task/$item_id");
    }
}
