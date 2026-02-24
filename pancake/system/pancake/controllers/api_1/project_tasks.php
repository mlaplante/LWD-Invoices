<?php defined('BASEPATH') OR exit('No direct script access allowed');
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
 * The Project Tasks API controller
 *
 * @subpackage    Controllers
 * @category      API
 */
class Project_tasks extends REST_Controller {
    /**
     * Tasks Editable Columns
     *
     * @var array
     */
    protected $tasks_editable_columns = array(
        'project_id',
        'name',
        'rate',
        'due_date',
        'notes',
        'parent_id',
        'completed',
        'milestone_id',
        'projected_hours',
        'status_id',
        'assigned_user_id',
        'is_viewable',
    );

    /**
     * Task Select
     *
     * @var string
     */
    protected $task_select = 'id, name, rate, notes, IF(due_date > 0, FROM_UNIXTIME(due_date), NULL) as due_date, completed, is_viewable, projected_hours, project_id, status_id, assigned_user_id, milestone_id, parent_id';
    //protected $task_select = 'id, name, rate, hours, notes, IF(due_date > 0, FROM_UNIXTIME(due_date), NULL) as due_date, completed, is_viewable, projected_hours, project_id, status_id, assigned_user_id, milestone_id, parent_id';

    /**
     * Constructor
     */
    public function __construct() {
        parent::__construct();

        $this->load->model('projects/project_m');
        $this->load->model('projects/project_task_m');
    }

    /**
     * Get All Tasks
     * Parameters:
     *  + id = projects_id (optional; will show all tasks if not specified)
     *  + limit = 5
     *  + start = 0
     *  + sort_by = email (default: id)
     *  + sort_dir = asc (default: asc)
     *
     * @link   /api/1/projects/tasks   GET Request
     */
    public function index_get() {
        if ($this->get('limit') or $this->get('start')) {
            $this->project_task_m->limit($this->get('limit'), $this->get('start'));
        }

        $sort_by = $this->get('sort_by') ? $this->get('sort_by') : 'id';
        $sort_dir = $this->get('sort_dir') ? $this->get('sort_dir') : 'asc';

        $this->project_task_m->order_by($sort_by, $sort_dir);
        $this->project_task_m->select($this->task_select, false);

        if ($this->get('id')) {
            $tasks = $this->project_task_m->get_many_by('project_id', $this->get('id'));
        } else {
            $tasks = $this->project_task_m->get_all();
        }

        $user_id = $this->get('user_id') === false ? null : (int) $this->get('user_id');
        $tree = $this->assignments->get_tree("project_tasks", $user_id);

        foreach ($tasks as $key => &$task) {
            if (!isset($tree[$task->id])) {
                unset($tasks[$key]);
                continue;
            }

            $task = $this->format_task($task);
            $task->permissions = $tree[$task->id];
        }

        $count = count($tasks);
        $this->response(array(
            'status' => true,
            'message' => "Found $count tasks",
            'tasks' => $tasks,
            'count' => $count,
        ), 200);
    }

    /**
     * Show Task
     *
     * @link   /api/1/projects/tasks/show   GET Request
     */
    public function show_get() {
        if (!$this->get('id')) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $task = $this->project_task_m
            ->select($this->task_select, false)
            ->get($this->get('id'));

        if (empty($task)) {
            $err_msg = 'This task could not be found.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        } else {
            $this->response(array('status' => true, 'message' => 'Found Task #' . $id, 'task' => $this->format_task($task)), 200);
        }
    }

    /**
     * Create Task
     *
     * @link   /api/1/projects/tasks/new   POST Request
     */
    public function new_post() {
        if (empty($_POST)) {
            $err_msg = 'No details were provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $this->load->helper('array');
        $task = elements_exist($this->tasks_editable_columns, $this->input->post());

        if ($id = $this->project_task_m->insert_task($task)) {
            $this->response(array('status' => true, 'id' => $id, 'task_id' => $id, 'message' => sprintf('Task #%s has been created.', $id)), 200);
        } else {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }
    }

    /**
     * Edit Post
     *
     * @link   /api/1/projects/tasks/edit   POST Request
     */
    public function edit_post() {
        $id = $this->post('id');
        if (!$id) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $task = $this->project_task_m->get($id);
        if (empty($task)) {
            $err_msg = 'This project does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        $this->load->helper('array');
        $task = elements_exist($this->tasks_editable_columns, $this->input->post());
        $task['id'] = $id;

        if ($this->project_task_m->update_task($task)) {
            $this->response(array(
                'status' => true,
                'message' => sprintf('Task #%d has been updated.', $id),
            ), 200);
        } else {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }
    }

    /**
     * Update Post
     *
     * @deprecated This should stay for backward compatibility
     * @link       /api/1/projects/tasks/update   POST Request
     */
    public function update_post() {
        $this->edit_post();
    }

    /**
     * Delete Task
     * TODO: This needs to delete times and timers associated
     *
     * @link   /api/1/projects/tasks/delete   POST Request
     */
    public function delete_post($id = null) {
        $id OR $id = $this->post('id');

        if (!$id) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $task = $this->project_task_m->get($id);

        if (empty($task)) {
            $err_msg = 'This task does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        if ($this->project_task_m->delete($id)) {
            $this->response(array('status' => true, 'message' => sprintf('Task #%d has been deleted.', $id)), 200);
        } else {
            $err_msg = sprintf('Failed to delete task #%d.', $id);
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 500);
        }
    }

    /**
     * Log Time
     *
     * @link   /api/1/projects/tasks/log_time   POST Request
     */
    public function log_time_post($id = null) {
        $id OR $id = $this->post('id') OR $id = $this->post('task_id');

        if (!$id) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        if (!($task = $this->project_task_m->get($id))) {
            $err_msg = 'This task does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        $this->load->model('projects/project_m');

        if (!($project = $this->project_m->get($task->project_id))) {
            $err_msg = 'This project does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        $this->load->model('clients/clients_m');

        if (!($client = $this->clients_m->getById($project->client_id))) {
            $err_msg = 'This client does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        //Custom code to make sure we don't end up with a negative number here...
        if (strtotime($this->post('end_time')) < strtotime($this->post('start_time'))) {
            $secondsInDay = 24 * 60 * 60;
            $minutes = (($secondsInDay - strtotime($this->post('start_time'))) + strtotime($this->post('end_time'))) / 60;
        } else {
            $minutes = (strtotime($this->post('end_time')) - strtotime($this->post('start_time'))) / 60;
        }

        //This bit of code is required to strip the seconds off of start and end time before saving to the database
        if (substr_count($this->post('start_time'), ":") == 2) {
            $start_time = substr($this->post('start_time'), 0, strrpos($this->post('start_time'), ":"));
        } else {
            $start_time = $this->post('start_time');
        }

        if (substr_count($this->post('end_time'), ":") == 2) {
            $end_time = substr($this->post('end_time'), 0, strrpos($this->post('end_time'), ":"));
        } else {
            $end_time = $this->post('end_time');
        }

        $input = array(
            'project_id' => $task->project_id,
            'start_time' => $start_time,
            'end_time' => $end_time,
            'date' => strtotime($this->post('date')),
            'note' => $this->post('note') ? $this->post('note') : "",
            'task_id' => $id,
            'user_id' => $this->post('user_id'),
            'minutes' => $minutes,
        );

        $this->load->model('projects/project_time_m');

        if (!$this->project_time_m->validate($input)) {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $this->project_time_m->insert($input);

        $this->response(array('status' => true, 'message' => 'Time logged.'), 200);
    }

    /**
     * Complete Task
     *
     * @link   /api/1/projects/tasks/complete   POST Request
     */
    public function complete_post($id = null) {
        $id OR $id = $this->post('id');

        // Get Task By ID returns a CI Result Object or FALSE
        $task = $this->project_task_m->where('completed', 0)->get_task_by_id($id);
        if (!$task) {
            $err_msg = 'There is no open task with the id ' . $id;
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        // Only pass the information we want to update
        $update_task['id'] = $id;
        $update_task['completed'] = 1;

        // Update Task to Complete
        if ($this->project_task_m->update_task($update_task, true)) {
            $this->response(array('status' => true, 'message' => 'Task #' . $id . ' marked as complete.'), 200);
        } else {
            $err_msg = 'Failed to complete task #' . $id;
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 500);
        }
    }

    /**
     * Reopen Task
     *
     * @link   /api/1/projects/tasks/reopen   POST Request
     */
    public function reopen_post($id = null) {
        $id OR $id = $this->post('id');

        // Only Reopen if already Complete
        $task = $this->project_task_m->where('completed', 1)->get_task_by_id($id);
        if (!$task) {
            $err_msg = 'There is no completed task with the \'id\' ' . $id . '!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        // Only pass the information we want to update
        $update_task['id'] = $id;
        $update_task['completed'] = 0;

        // Update Task to Open
        if ($this->project_task_m->update_task($update_task, true)) {
            $this->response(array('status' => true, 'message' => 'Task #' . $id . ' marked as open.'), 200);
        } else {
            $err_msg = 'Failed to reopen task #' . $id;
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 500);
        }
    }

    /**
     * Format Task
     *
     * @param  object
     *
     * @return object
     */
    protected function format_task($task) {
        if (empty($task)) {
            return $task;
        }

        $task->id = (int) $task->id;
        $task->project_id = (int) $task->project_id;
        $task->parent_id = (int) $task->parent_id;
        $task->milestone_id = (int) $task->milestone_id;
        $task->assigned_user_id = (int) $task->assigned_user_id;
        $task->rate = (float) $task->rate;
        //$task->hours = (float) $task->hours;
        $task->completed = (bool) $task->completed;

        return $task;
    }

}