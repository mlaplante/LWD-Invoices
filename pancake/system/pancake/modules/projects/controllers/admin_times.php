<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2010, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link           http://pancakeapp.com
 * @since          Version 1.1
 */

/**
 * The admin controller for times
 *
 * @subpackage    Controllers
 * @category      Projects
 */
class Admin_Times extends Admin_Controller {

    /**
     * Load in the dependencies
     *
     * @access    public
     * @return    void
     */
    public function __construct() {
        parent::__construct();

        $this->load->model(array(
            'project_m', 'project_task_m',
            'project_time_m', 'project_milestone_m',
        ));
    }

    public function index() {
        access_denied();
    }

    public function add_hours($project_id = null, $redirect_to = 'project') {

        can('read', $this->project_m->getClientIdById($project_id), 'projects', $project_id) or access_denied();

        if ($_POST) {

            if (!empty($_POST['task_id'])) {
                can('read', $this->project_task_m->getClientIdById($_POST['task_id']), 'project_tasks', $_POST['task_id']) or access_denied();
            }

            $this->load->model('projects/project_time_m');
            //$this->project_time_m->insert_hours($project_id, $_POST['date'], time_to_decimal($_POST['hours']), empty($_POST['task_id']) ? 0 : $_POST['task_id'], $_POST['note']);
            switch ($_POST['day']) {
                case 'yesterday':
                    $date = strtotime('-1 day');
                    break;

                case 'other':
                    $date = $_POST['date'];
                    break;

                default:
                    $date = time();
                    break;
            }

            $this->project_time_m->insert_hours($project_id, $date, time_to_decimal($_POST['hours']), empty($_POST['task_id']) ? 0 : $_POST['task_id'], $_POST['note'], ($_POST['start_time'] ? $_POST['start_time'] : null));

            switch ($redirect_to) {
                case "task":
                    $redirect_to = "admin/projects/times/view_entries/task/" . $_POST['task_id'];
                    break;
                case "project":
                    $redirect_to = "admin/projects/times/view_entries/project/" . $_POST['project_id'];
                    break;
                default:
                    $redirect_to = "admin/projects/view/" . $_POST['project_id'];
                    break;
            }

            redirect($redirect_to);
        } else {

            $tasks = $this->project_task_m->where('project_id', $project_id)->order_by('name')->get_all();
            $tasks_select = array('' => '-- Not related to a task --');
            foreach ($tasks as $task) {
                $tasks_select[$task->id] = $task->name;
            }

            $this->load->view('_add_hours', array(
                'project' => $this->project_m->get_project_by_id($project_id)->row(),
                'tasks_select' => $tasks_select,
            ));
        }
    }

    public function create($project_id = null) {

        if ($_POST) {

            can('read', $this->project_m->getClientIdById($this->input->post('project_id')), 'projects', $this->input->post('project_id')) or access_denied();

            if (!empty($_POST['task_id'])) {
                can('read', $this->project_task_m->getClientIdById($_POST['task_id']), 'project_tasks', $_POST['task_id']) or access_denied();
            }

            $data = $this->_start_end_date_to_minutes(
                $this->input->post('start_time'), $this->input->post('end_time'), $this->input->post('date')
            );

            $result = $this->project_time_m->insert(array(
                'project_id' => $this->input->post('project_id'),
                'start_time' => $data['start_time'],
                'end_time' => $data['end_time'],
                'minutes' => $data['minutes'],
                'date' => $data['date'],
                'note' => $this->input->post('note'),
                'task_id' => $this->input->post('task_id'),
                'user_id' => $this->current_user->id,
            ));

            // All form validation is handled in the model, so lets just throw it the data
            if ($result) {
                $message = array('success' => $this->lang->line('times.create.succeeded'));
            } else {
                if ($errors = validation_errors('<p>', '</p>')) {
                    $message = array('error' => $errors);
                } else {
                    $message = array('error' => $this->lang->line('times.create.failed'));
                }
            }

            output_json($message);
        }

        $tasks = $this->project_task_m->where('project_id', $project_id)->order_by('name')->get_all();
        $tasks_select = array('' => '-- Not related to a task --');
        foreach ($tasks as $task) {
            $tasks_select[$task->id] = $task->name;
        }

        $this->load->view('time_form', array(
            'project' => $this->project_m->get_project_by_id($project_id)->row(),
            'tasks_select' => $tasks_select,
        ));
    }

    public function delete($time_id) {

        # This isn't being used?
        # I couldn't find project_time_m->delete_time, which is why I ask.

        // delete time. Ajax Only.
        $time = $this->project_time_m->get_time_by_id($time_id);

        if ($time->num_rows() == 0) {
            $message = array('error' => 'Invalid Object');
        } else {
            $message = array('success' => 'Deleted Object');
            $this->project_time_m->delete_time($time_id);
        }

        output_json($message);
    }

    public function _view_entries($type, $id, $short = false) {

        $this->template->task_id = 0;

        switch ($type) {
            case 'project':
                $entries = $this->project_time_m->get_times_by_project($id);
                $project_id = $id;
                can('read', $this->project_m->getClientIdById($project_id), 'projects', $project_id) or access_denied();
                break;
            case 'task':
                $project_id = $this->db->select('project_id')->where('id', $id)->get('project_tasks')->row_array();
                $project_id = isset($project_id['project_id']) ? $project_id['project_id'] : 0;
                can('read', $this->project_m->getClientIdById($project_id), 'projects', $project_id) or access_denied();
                can('read', $this->project_task_m->getClientIdById($id), 'project_tasks', $id) or access_denied();
                $entries = $this->project_time_m->get_task_entries_by_task($id);
                $this->template->task_id = $id;
                break;
            default:
                show_error('Page not found', 404);
                break;
        }

        $tasks = $this->project_task_m->where('project_id', $project_id)->order_by('name')->get_all();

        $tasks_select = array('' => '-- Not related to a task --');
        foreach ($tasks as $task) {
            $tasks_select[$task->id] = $task->name;
        }

        usort($entries, function ($a, $b) {
            # Normalize dates.
            # We don't care about formats or anything because we just want to confirm that they're the same day, as cheaply as possible.
            $date_a = strtotime(date("Y-m-d", $a->date));
            $date_b = strtotime(date("Y-m-d", $b->date));
            if ($date_a < $date_b) {
                return 1;
            } elseif ($date_a > $date_b) {
                return -1;
            } else {
                $time_a = explode(":", $a->start_time);
                $time_a = $time_a[0] + (isset($time_a[1]) ? ($time_a[1] / 60) : 0);
                $time_b = explode(":", $b->start_time);
                $time_b = $time_b[0] + (isset($time_b[1]) ? ($time_b[1] / 60) : 0);

                if ($time_a == $time_b) {
                    return 0;
                } else {
                    return $time_a > $time_b ? -1 : 1;
                }
            }
        });

        $tpl_data = array(
            'entries' => $entries,
            'type' => $type,
            'tasks_select' => $tasks_select,
            'project_id' => $project_id,
            'project' => $this->project_m->get($project_id),
        );

        if ($short) {
            $this->load->view('view_entries', $tpl_data);
        } else {
            $this->template->build('view_entries', $tpl_data);
        }
    }

    public function view_entries($type, $id) {
        $this->_view_entries($type, $id);
    }

    public function view_short_entries($type, $id) {
        $this->_view_entries($type, $id, true);
    }

    public function edit($entry_id, $redirect_to = 'project') {

        $post = $this->input->post();

        $record = $this->db->where('id', $entry_id)->get('project_times')->row_array();

        if (!isset($record['task_id'])) {
            access_denied();
        }

        if ($record['task_id'] != 0) {
            where_assigned('project_tasks', 'read', 'task_id', 'project_times');
        }

        where_assigned('projects', 'read', 'project_id', 'project_times');

        if (!empty($post['date'])) {
            $date = carbon($post['date']);
        } else {
            $date = now();
        }

        $date = $date->timestamp;

        $data = $this->_start_end_date_to_minutes($post['start_time'], $post['end_time'], $date);

        if (isset($_POST['note'])) {
            $data['note'] = $post['note'];
        }

        if (isset($_POST['task_id'])) {
            $data['task_id'] = (int) $post['task_id'];
        }


        $this->db
            ->where('id', $entry_id)
            ->update('project_times', $data);

        redirect('/admin/projects/times/view_entries/' . $redirect_to . '/' . ($redirect_to == "project" ? $post['project_id'] : $post['task_id']));

    }


    public function ajax_set_entry() {

        $post = $this->input->post();

        $record = $this->db->where('id', $post['id'])->get('project_times')->row_array();

        if (!isset($record['task_id'])) {
            access_denied();
        }

        if ($record['task_id'] != 0) {
            where_assigned('project_tasks', 'read', 'task_id', 'project_times');
        }

        where_assigned('projects', 'read', 'project_id', 'project_times');

        if (!empty($post['date'])) {
            $date = carbon($post['date']);
        } else {
            $date = now();
        }

        $date = $date->timestamp;

        $data = $this->_start_end_date_to_minutes($post['start_time'], $post['end_time'], $date);
        $rounded_minutes = $this->project_time_m->get_rounded_minutes($data['minutes']);

        if (isset($_POST['note'])) {
            $data['note'] = $_POST['note'];
        }

        if (isset($_POST['task_id'])) {
            $data['task_id'] = $_POST['task_id'];
        }

        $this->db
            ->where('id', $post['id'])
            ->update('project_times', $data);

        $this->_json([
            'new_duration' => format_hours($data['minutes'] / 60),
            'new_rounded_duration' => format_hours($rounded_minutes / 60),
        ]);
    }

    public function ajax_delete_entry() {

        $record = $this->db->where('id', $this->input->post('id'))->get('project_times')->row_array();

        if (!isset($record['task_id'])) {
            access_denied();
        }

        if ($record['task_id'] != 0) {
            where_assigned('project_tasks', 'read', 'task_id', 'project_times');
        }

        where_assigned('projects', 'read', 'project_id', 'project_times');

        $this->db
            ->where('id', $this->input->post('id'))
            ->delete('project_times');
    }

    private function _start_end_date_to_minutes($start_time, $end_time, $date) {

        if (empty($start_time) && empty($end_time)) {
            return array(
                "minutes" => 0,
                "start_time" => "00:00",
                "end_time" => "00:00",
                "date" => $date,
            );
        }

        $start_date = carbon($date)->startOfDay();
        $date = $start_date->timestamp;
        $end_date = $start_date->copy();

        if (strstr($start_time, ":") === false && is_numeric($start_time)) {
            if (strlen($start_time) != 4) {
                # It's a time like "5", and doesn't have AM/PM (otherwise it wouldn't be numeric).
                # It's also not like 2100 (4-digit, which means 9 PM)
                $start_time = $start_time . ":00";
            }
        }

        if (strstr($end_time, ":") === false && is_numeric($end_time)) {
            if (strlen($end_time) != 4) {
                # It's a time like "5", and doesn't have AM/PM (otherwise it wouldn't be numeric).
                # It's also not like 2100 (4-digit, which means 9 PM)
                $end_time = $end_time . ":00";
            }
        }

        $start_time = \Carbon\Carbon::parse($start_time, Settings::get("timezone"))->toTimeString();
        $end_time = \Carbon\Carbon::parse($end_time, Settings::get("timezone"))->toTimeString();

        $start_date->setTimeFromTimeString($start_time);
        $end_date->setTimeFromTimeString($end_time);

        if ($start_date->gt($end_date)) {
            $end_date->addDay();
        }

        return array(
            "minutes" => $start_date->diffInMinutes($end_date),
            "start_time" => $start_date->format("H:i"),
            "end_time" => $end_date->format("H:i"),
            "date" => $date,
        );
    }

    
    public function timers_play($task_id, $start_timestamp) {
        can('read', $this->project_task_m->getClientIdById($task_id), 'project_tasks', $task_id) or access_denied();
        $this->load->model('projects/project_timers_m', 'ptm');
        $result = $this->ptm->play($task_id, $start_timestamp);
        echo json_encode(array('result' => $result));
    }

    public function timers_pause($task_id, $pause_timestamp) {
        can('read', $this->project_task_m->getClientIdById($task_id), 'project_tasks', $task_id) or access_denied();
        $this->load->model('projects/project_timers_m', 'ptm');
        $result = $this->ptm->pause($task_id, $pause_timestamp);
        echo json_encode(array('result' => $result));
    }

    public function timers_stop($task_id, $stop_timestamp) {
        can('read', $this->project_task_m->getClientIdById($task_id), 'project_tasks', $task_id) or access_denied();
        $this->load->model('projects/project_timers_m', 'ptm');
        $result = $this->ptm->stop($task_id, $stop_timestamp);
        echo json_encode(array('result' => $result));
    }

}
