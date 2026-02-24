<?php

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
 * @since		Version 3.2.0
 */

/**
 * The admin controller for milestones
 *
 * @subpackage	Controllers
 * @category	Projects
 */
class Admin_Milestones extends Admin_Controller {

    /**
     * Load in the dependencies
     *
     * @return	void
     */
    public function __construct() {
        parent::__construct();

        $this->load->model(array('project_m', 'project_milestone_m', 'project_task_m', 'project_time_m'));
    }

    public function edit($id = NULL) {
        (IS_AJAX and is_admin()) or access_denied();

        if (!($milestone = $this->project_milestone_m->get($id))) {
            $this->session->set_flashdata('error', 'Invalid milestone!');
            redirect('admin/projects');
        }

        if (!($project = $this->project_m->get_project_by_id($milestone->project_id)->row())) {
            $this->session->set_flashdata('error', 'Invalid Project!');
            redirect('admin/projects');
        }

        if ($_POST) {

            $target_date = $this->input->post('target_date');

            if (!empty($target_date)) {
                $target_date = carbon($target_date)->timestamp;
            } else {
                $target_date = 0;
            }

            $result = $this->project_milestone_m->update($id, array(
                'name' => $this->input->post('name'),
                'description' => $this->input->post('description'),
                'project_id' => $project->id,
                'color' => $this->input->post('color'),
                'target_date' => $target_date,
            ));

            // This should be handled in milestone#update, but we can leave it here for now.
            if ($result && $this->input->post('assigned_user_id') != $milestone->assigned_user_id) {
                $result = $this->project_milestone_m->set_assigned_user($id, $this->input->post('assigned_user_id'));
            }

            // All form validation is handled in the model, so lets just throw it the data
            if ($result) {
                $message = array('success' => __('milestones:edit_success', array($this->input->post('name'))));
            } else {
                if ($errors = validation_errors('<p>', '</p>')) {
                    $message = array('error' => $errors);
                } else {
                    $message = array('error' => __('milestones:edit_failed', array($this->input->post('name'))));
                }
            }

            output_json($message);
        }

        $users = $this->ion_auth->get_users();
        $users_select = array('' => __('milestones:select_assignee_default'));
        foreach ($users as $user) {
            $users_select[$user->id] = $user->first_name . ' ' . $user->last_name . ' (' . $user->username . ')';
        }

        $this->template->action = 'edit';
        $this->load->view('milestones/form', array(
            'project' => $this->project_m->get_project_by_id($project->id)->row(),
            'milestone' => $milestone,
            'users_select' => $users_select,
            'action' => 'edit'
        ));
    }

    public function create($project_id = NULL) {
        (IS_AJAX and is_admin()) or access_denied();

        if ($_POST) {

            $target_date = $this->input->post('target_date');

            if (!empty($target_date)) {
                $target_date = carbon($target_date)->timestamp;
            } else {
                $target_date = 0;
            }

            $result = $this->project_milestone_m->insert(array(
                'name' => $this->input->post('name'),
                'description' => $this->input->post('description'),
                'project_id' => $project_id,
                'color' => $this->input->post('color'),
                'target_date' => $target_date,
                'is_viewable' => 0
            ));

            if ($result && $this->input->post('assigned_user_id')) {
                $result = $this->project_milestone_m->set_assigned_user($result, $this->input->post('assigned_user_id'));
            }

            // All form validation is handled in the model, so lets just throw it the data
            if ($result) {
                $message = array('success' => __('milestones:add_success', array($this->input->post('name'))));
            } else {
                if ($errors = validation_errors('<p>', '</p>')) {
                    $message = array('error' => $errors);
                } else {
                    $message = array('error' => __('milestones:add_failed', array($this->input->post('name'))));
                }
            }

            output_json($message);
        }

        $users = $this->ion_auth->get_users();
        $users_select = array('' => __('milestones:select_assignee_default'));
        foreach ($users as $user) {
            $users_select[$user->id] = $user->first_name . ' ' . $user->last_name . ' (' . $user->username . ')';
        }

        $this->load->view('milestones/form', array(
            'project' => $this->project_m->get_project_by_id($project_id)->row(),
            'users_select' => $users_select,
        ));
    }

    public function delete($milestone_id) {
        is_admin() or access_denied();

        $milestone = $this->project_milestone_m->get($milestone_id);

        if (!$milestone) {
            $this->session->set_flashdata('error', __('milestones:does_not_exist'));
            redirect('admin/projects');
        }

        $this->project_task_m->skip()->update_by('milestone_id', $milestone_id, array('milestone_id' => 0));

        $this->project_milestone_m->delete($milestone_id);

        $this->db
                ->where('milestone_id', $milestone->id)
                ->set('milestone_id', 0)
                ->update('project_tasks');

        $this->session->set_flashdata('success', __('milestones:delete_success', array($milestone->name)));
        redirect('admin/projects/view/' . $milestone->project_id);
    }

    public function view($id, $offset = null) {
        $this->load->helper('typography');

        if (!($milestone = $this->project_milestone_m->get($id))) {
            $this->session->set_flashdata('error', 'Invalid milestone!');
            redirect('admin/projects');
        }

        if (!($project = $this->project_m->get_project_by_id($milestone->project_id)->row())) {
            $this->session->set_flashdata('error', 'Invalid Project!');
            redirect('admin/projects');
        }

        // Start up the pagination
        $this->load->library('pagination');
        $this->pagination_config['base_url'] = site_url('admin/projects/view/' . $project->id . '/');
        $this->pagination_config['uri_segment'] = 6;
        $this->pagination_config['total_rows'] = $this->project_task_m->where('milestone_id', $milestone->id)->count_all_tasks($project->id);

        $this->pagination->initialize($this->pagination_config);

        $tasks = $this->project_task_m->get_tasks_and_times_by_project($project->id, 500, 0, true, $milestone->id);

        foreach ($tasks as $key => $task) {
            $subtasks = $this->project_task_m->get_tasks_and_times_by_project($project->id, 500, 0, true, null, $task['id']);
            $tasks[$key]['subtasks'] = $subtasks ? $subtasks : array();
        }

        $this->load->model('projects/project_task_statuses_m');
        $this->template->task_status_types = $this->project_task_statuses_m->get_all();

        $users = $this->ion_auth->get_users();
        $users_select = array('' => __('milestones:select_assignee_default'));
        foreach ($users as $user) {
            $users_select[$user->id] = $user->first_name . ' ' . $user->last_name . ' (' . $user->username . ')';
        }

        $this->template->build('milestones/view', array(
            'project' => $project,
            'milestone' => $milestone,
            'tasks' => $tasks,
            'users_select' => $users_select,
        ));
    }

    function update_position() {
        if (filter_has_var(INPUT_POST, 'milestones_order')) {
            if ($this->project_milestone_m->update_order($_POST['project_id'], $_POST['milestones_order'])) {
                echo "OK";
            } else {
                echo "NO";
            }
        } else {
            echo "NO";
        }
    }

}
