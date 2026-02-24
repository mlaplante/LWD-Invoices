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
 * The Project API controller
 *
 * @subpackage    Controllers
 * @category      API
 */
class Projects extends REST_Controller {

    /**
     * Projects Editable Columns
     *
     * @var array
     */
    protected $projects_editable_columns = array(
        'id',
        'client_id',
        'name',
        'currency',
        'due_date',
        'rate',
        'description',
        'projected_hours',
        'is_viewable',
        'is_archived',
        'completed',
    );

    /**
     * Constructor
     */
    public function __construct() {
        parent::__construct();

        $this->load->model('projects/project_m');
    }

    /**
     * Get All Projects
     * Parameters:
     *  + limit = 5
     *  + start = 0
     *  + sort_by = email (default: id)
     *  + sort_dir = asc (default: asc)
     *
     * @link   /api/1/projects   GET Request
     */
    public function index_get() {
        if ($this->get('limit') or $this->get('start')) {
            $this->project_m->limit($this->get('limit'), $this->get('start'));
        }

        $sort_by = $this->get('sort_by') ? $this->get('sort_by') : 'id';
        $sort_dir = $this->get('sort_dir') ? $this->get('sort_dir') : 'asc';

        $user_id = $this->get('user_id') === false ? null : (int) $this->get('user_id');
        $tree = $this->assignments->get_tree("projects", $user_id);

        $projects = $this->project_m->order_by($sort_by, $sort_dir)->get_all();

        foreach ($projects as $key => &$project) {
            if (!isset($tree[$project->id])) {
                unset($projects[$key]);
                continue;
            }

            $project->permissions = $tree[$project->id];
        }

        $count = count($projects);
        $this->response(array(
            'status' => true,
            'message' => "Found $count projects",
            'projects' => $projects,
            'count' => $count,
        ), 200);
    }

    /**
     * Show Project
     *
     * @link   /api/1/projects/show   GET Request
     */
    public function show_get() {
        $this->load->model('projects/project_task_m');

        if (!$this->get('id')) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        if (!$project = $this->project_m->get($this->get('id'))) {
            $err_msg = 'This project could not be found.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        $user_id = $this->get('user_id') === false ? null : (int) $this->get('user_id');
        $tree = $this->assignments->get_tree("projects", $user_id);

        if (!isset($tree[$project->id])) {
            $err_msg = 'This project could not be found.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        $project->permissions = $tree[$project->id];

        $tasks = $this->project_task_m
            ->select('id, name, rate, hours, IF(due_date > 0, FROM_UNIXTIME(due_date), NULL) as due_date, completed', false)
            ->get_many_by('project_id', $this->get('id'));

        $tree = $this->assignments->get_tree("project_tasks", $user_id);

        foreach ($tasks as $key => &$task) {
            if (!isset($tree[$task->id])) {
                unset($tasks[$key]);
                continue;
            }

            $task->id = (int) $task->id;
            $task->rate = (float) $task->rate;
            $task->hours = (int) $task->hours;
            $task->completed = (bool) $task->completed;
            $task->permissions = $tree[$task->id];
        }

        $this->response(array(
            'status' => true,
            'project' => $project,
            'tasks' => $tasks,
            'message' => 'Found project and tasks',
        ), 200);
    }

    /**
     * Create Project
     *
     * @link   /api/1/projects/new   POST Request
     */
    public function new_post() {
        if (empty($_POST)) {
            $err_msg = 'No details were provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        if ($id = $this->project_m->insert($this->input->post())) {
            // 'project_id' is deprecated
            $this->response(array('status' => true, 'id' => $id, 'project_id' => $id, 'message' => sprintf('Project #%s has been created.', $id)), 200);
        } else {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }
    }

    /**
     * Edit User
     * The original documented endpoint.
     *
     * @link   /api/1/projects/edit    POST Request
     */
    public function edit_post() {
        $this->update_post();
    }

    /**
     * Update User
     *
     * @deprecated This should stay for backward compatibility
     * @link       /api/1/projects/update   POST Request
     */
    public function update_post() {
        if (!$this->post('id')) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $project = $this->project_m->get($this->post('id'));

        if (empty($project)) {
            $err_msg = 'This project does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        $this->load->helper('array');
        $data = elements_exist($this->projects_editable_columns, $this->input->post());
        if ($this->project_m->update($project->id, $data)) {
            $this->response(array(
                'status' => true,
                'message' => sprintf('Project #%d has been updated.', $project->id),
            ), 200);
        } else {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }
    }

    /**
     * Delete Project
     *
     * @link   /api/1/projects/delete   POST Request
     */
    public function delete_post($id = null) {
        $id OR $id = $this->post('id');

        if (!$project = $this->project_m->get($id)) {
            $err_msg = 'This project does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        if ($this->project_m->delete_project($id)) {
            $this->response(array('status' => true, 'message' => sprintf('Project #%d has been deleted.', $id)), 200);
        } else {
            $err_msg = sprintf('Failed to delete project #%d.', $id);
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 500);
        }
    }

}