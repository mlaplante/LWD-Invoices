<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package             Pancake
 * @author              Pancake Dev Team
 * @copyright           Copyright (c) 2012, Pancake Payments
 * @license             http://pancakeapp.com/license
 * @link                http://pancakeapp.com
 * @since               Version 4.0
 */
// ------------------------------------------------------------------------

/**
 * The Project Timers Model
 *
 * @subpackage    Models
 * @category      Payments
 */
class Project_timers_m extends Pancake_Model {

    /**
     * Start a new timer, or un-pause an existing one.
     *
     * @param  int $task_id         Project task ID
     * @param  int $start_timestamp Starting timestamp
     *
     * @return void
     */
    function play($task_id, $start_timestamp) {
        $row = $this->get_by(array(
            'task_id' => $task_id,
            'is_over' => 0,
        ));

        if (!empty($row)) {
            // A paused timer already exists.
            $this->update($row->id, array(
                'is_paused' => 0,
                'last_modified_timestamp' => $start_timestamp,
            ));
        } else {
            // Begin a new timer for this task.
            $this->insert(array(
                'task_id' => $task_id,
                'user_id' => $this->current_user->id,
                'pauses_json' => json_encode(array()),
                'start_timestamp' => $start_timestamp,
                'last_modified_timestamp' => $start_timestamp,
                'current_seconds' => 0,
            ));
        }
    }

    /**
     * Pause a running task timer.
     *
     * @param  int $task_id         Project task ID
     * @param  int $pause_timestamp Pause timestamp
     *
     * @return boolean
     */
    function pause($task_id, $pause_timestamp) {
        $row = $this->get_by(array(
            'task_id' => $task_id,
            'is_paused' => 0,
            'is_over' => 0,
        ));

        if (!isset($row->id)) {
            # The timer might've been stopped (or paused) in the time that it took for this pause to get through.
            # Which would make it not be loaded here.
            # So we assume everything's OK.
            return true;
        }

        /*
            Note to devs: the pauses_json column does not actually affect the timestamps
            or current_seconds generated when play/pause/stop is called. It's pretty much
            just a reference at this point, and should probably be deprecated.
            - Eric, 2013-04-23
         */

        $pauses = json_decode($row->pauses_json, true);
        $pauses[] = array('started' => $row->last_modified_timestamp, 'paused' => $pause_timestamp);
        $pauses = json_encode($pauses);

        $current_seconds = $row->current_seconds + ($pause_timestamp - $row->last_modified_timestamp);

        return $this->update($row->id, array(
            'pauses_json' => $pauses,
            'is_paused' => 1,
            'current_seconds' => $current_seconds,
            'last_modified_timestamp' => $pause_timestamp,
        ));
    }

    /**
     * Stop a running timer completely.
     *
     * @param  int $task_id        Project task ID
     * @param  int $stop_timestamp Stop timestamp
     *
     * @return boolean
     */
    function stop($task_id, $stop_timestamp) {
        $row = $this->get_by(array(
            'task_id' => $task_id,
            'is_over' => 0,
        ));

        // If there are no currently-running timers, we have nothing to stop.
        if (empty($row)) {
            return;
        }

        $current_seconds = (!$row->is_paused)
            ? $row->current_seconds + ($stop_timestamp - $row->last_modified_timestamp)
            : $row->current_seconds;

        // Store in regular project times. Probably with the same mechanism as add_hours.
        $this->project_time_m->insert_time_raw($task_id, $row->start_timestamp, $current_seconds, $row->user_id);

        return $this->update($row->id, array(
            'is_paused' => 0,
            'current_seconds' => $current_seconds,
            'is_over' => 1,
            'last_modified_timestamp' => $stop_timestamp,
        ));
    }

    /**
     * Get running timers
     *
     * @return array List of running timers
     */
    function get_running_timers() {
        $buffer = $this->db
            ->select('last_modified_timestamp, user_id, is_paused, current_seconds, projects.id as project_id, projects.name as project_name, project_tasks.name as task_name, task_id')
            ->where('is_over', 0)
            ->where('start_timestamp !=', 0)
            ->join('project_tasks', 'project_tasks.id = task_id')
            ->join('projects', 'projects.id = project_id')
            ->get('project_timers')
            ->result_array();

        $timers = array();

        foreach ($buffer as $row) {
            $timers[$row['task_id']] = $row;
        }

        return $timers;
    }
}