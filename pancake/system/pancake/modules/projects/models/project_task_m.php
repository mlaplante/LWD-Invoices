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
 * @since          Version 1.1
 */

// ------------------------------------------------------------------------

/**
 * The Project Task Model
 *
 * @subpackage    Models
 * @category      Payments
 */
class Project_task_m extends Pancake_Model {
    /**
     * @var    string    The projects table name
     */
    protected $projects_table = 'projects';

    /**
     * @var string    The tasks table
     */
    protected $tasks_table = 'project_tasks';

    /**
     * @var string    The time entries table
     */
    protected $times_table = 'project_times';

    /**
     * @var    array    The array of validation rules
     */
    protected $validate = array(
        array(
            'field' => 'project_id',
            'label' => 'Project',
            'rules' => 'required',
        ),
        array(
            'field' => 'name',
            'label' => 'Name',
            'rules' => 'required',
        ),
        array(
            'field' => 'due_date',
            'label' => 'Due Date',
            'rules' => '',
        ),
    );

    // --------------------------------------------------------------------

    /**
     * Retrieves the task sub-tasks with a given task id
     *
     * @access    public
     *
     * @param    int        The amount of results to return
     * @param    int        The offset to start from
     *
     * @return    array    The result
     */
    public function get_tasks_by_project($project_id = null, $limit = null, $offset = null, $parent_id = null, $all = false) {
        where_assigned('project_tasks', 'read');

        $correct_parent_id = false;

        $this->db
            ->select($this->tasks_table . '.*')
            ->select("project_task_statuses.title as status_title, project_task_statuses.background_color, project_task_statuses.font_color, project_task_statuses.text_shadow, project_task_statuses.box_shadow, project_milestones.id as milestone_id, project_milestones.name as milestone_name, project_milestones.description as milestone_description, color as milestone_color, users.email as assigned_user_email")
            ->join('project_task_statuses', 'project_task_statuses.id = project_tasks.status_id', 'left')
            ->join('project_milestones', 'project_milestones.id = project_tasks.milestone_id', 'left')
            ->join('users', 'users.id = project_tasks.assigned_user_id', 'left');
        if ($project_id !== null) {
            $this->db->where($this->db->dbprefix($this->tasks_table) . '.project_id', $project_id, false);
        }
        if ($parent_id) {
            $this->db->where($this->db->dbprefix($this->tasks_table) . '.parent_id', $parent_id);
        } elseif (!$all) {
            $correct_parent_id = true;
            $tasks_table = $this->db->dbprefix($this->tasks_table);
            $this->db->where("($tasks_table.parent_id not in (select id from $tasks_table) or $tasks_table.parent_id = 0)", null, false);
        }

        $milestones_table = $this->db->dbprefix("project_milestones");
        $this->db->qb_orderby[] = "ifnull($milestones_table.order, 10000) asc, $milestones_table.id asc, `order` asc, $milestones_table.target_date, completed ASC, id ASC";
        $this->db->group_by('')->limit($limit, $offset);
        $result = $this->db->get($this->tasks_table)->result_array();

        // Create an accessable array of references
        $tasks = array();
        foreach ($result as $task) {
            $task['entries'] = array();
            $task['tracked_hours'] = 0;
            $task['rounded_tracked_hours'] = 0;

            $tasks[$task['id']] = $task;
        }

        if ($tasks) {
            // Get all times associated with any of these tasks
            $this->load->model("projects/project_time_m");
            $rounded_minutes = $this->project_time_m->get_rounded_minutes_sql("rounded_minutes");
            $times = $this->db
                ->select("id, task_id, minutes, $rounded_minutes")
                ->where_in('task_id', array_keys($tasks))
                ->get('project_times')
                ->result();

            // Increase the tracked time, and push the time id into the entries array
            foreach ($times as $time) {
                $task = $tasks[$time->task_id];

                array_push($task['entries'], $time);
                $task['tracked_hours'] += $time->minutes / 60;
                $task['rounded_tracked_hours'] += $time->rounded_minutes / 60;

                $tasks[$time->task_id] = $task;
            }
        }

        if ($correct_parent_id) {
            foreach ($tasks as $task_id => $task) {
                if ($task['parent_id'] != 0) {
                    # This task needs its parent_id to be reset.
                    $this->db->where('id', $task['id'])->update($this->tasks_table, ['parent_id' => 0]);
                    $tasks[$task_id]['parent_id'] = 0;
                }
            }
        }

        return $tasks;
    }

    public function get_toplevel_tasks($project_id, $limit = null, $offset = null) {
        $this->db->where('parent_id', 0);
        return $this->get_tasks_by_project($project_id, $limit, $offset);
    }

    public function get_child_tasks($parent_task_id, $limit = null, $offset = null) {
        $this->db->select('*');
        return $this->get_tasks_by_project(null, $limit, $offset, $parent_task_id);
    }

    public function upcoming_tasks_for_user($user_id, $x = 6) {

        if (empty($user_id)) {
            return array();
        }

        $tasks_table = $this->db->dbprefix($this->tasks_table);
        $projects_table = $this->db->dbprefix($this->projects_table);
        $project_task_statuses_table = $this->db->dbprefix('project_task_statuses');

        $tasks_assigned = get_assigned_ids('project_tasks', 'read');
        if (count($tasks_assigned) > 0) {
            $tasks_assigned = "and pt.id in (" . implode(',', $tasks_assigned) . ")";
        } else {
            $tasks_assigned = "";
        }

        /* ->select('project_tasks.*, projects.name as project_name, project_task_statuses.title as status_title, project_task_statuses.background_color, project_task_statuses.font_color, project_task_statuses.text_shadow, project_task_statuses.box_shadow')
          ->select('project_milestones.id as milestone_id, project_milestones.name as milestone_name, color as milestone_color')
          ->join('projects', 'project_tasks.project_id = projects.id')
          ->join('project_task_statuses', 'project_task_statuses.id = project_tasks.status_id', 'left') */

        $sql = "
SELECT pt.completed, pt.name AS task_name, pt.is_viewable, pt.is_timesheet_viewable, pt.projected_hours, pt.notes, pt.id AS task_id, pt.due_date AS task_due_date,
        pt.status_id,
        pts.title as status_title, pts.background_color, pts.font_color, pts.text_shadow, pts.box_shadow,
    pt.assigned_user_id AS task_user_id, p.id AS project_id, p.name AS project_name
 FROM {$tasks_table} AS pt
 JOIN {$projects_table} AS p ON p.id = pt.project_id
     LEFT JOIN {$project_task_statuses_table} as pts ON pts.id = pt.status_id
WHERE p.id = pt.project_id
  AND pt.assigned_user_id = $user_id
  AND pt.completed = 0
  AND p.is_archived = 0
  $tasks_assigned

order by IF(task_due_date > 0, task_due_date, " . PHP_INT_MAX . ") asc
limit $x
";

        return $this->db->query($sql)->result_array();
    }

    public function get_team_status($exclude_user = null, $x = 6) {
        $tasks_table = $this->db->dbprefix($this->tasks_table);
        $projects_table = $this->db->dbprefix($this->projects_table);
        $meta_table = $this->db->dbprefix('meta');
        $user_table = $this->db->dbprefix('users');

        $tasks_assigned = get_assigned_ids('project_tasks', 'read');
        if (count($tasks_assigned) > 0) {
            $tasks_assigned = "and pt.id in (" . implode(',', $tasks_assigned) . ")";
        } else {
            // If there are no assigned tasks for the user, it can't show ANY tasks.
            $tasks_assigned = "and pt.id = null";
        }

        $sql = <<<sql
select pt.name as task_name, pt.id as task_id, pt.due_date as task_due_date, pt.assigned_user_id as task_user_id,
    p.id as project_id, p.name as project_name,
    CONCAT(m.first_name, ' ', m.last_name) as full_name,
    u.email as assigned_user_email
    from ($tasks_table pt, $projects_table p, $meta_table m, $user_table u)
    where p.id = pt.project_id
    and m.user_id = pt.assigned_user_id
    and u.id = pt.assigned_user_id
    and pt.assigned_user_id is not null
    and p.is_archived = 0
    and pt.completed <> 1
        $tasks_assigned
sql;

        $sql .= $exclude_user ? " and pt.assigned_user_id <> $exclude_user" : '';
        $sql .= " limit $x";

        $ret = $this->db->query($sql)->result();

        // meh, should be using array_map, but unsure as to how to return proper keys
        $by_project = array();
        foreach ($ret as $k => $v) {
            $by_project[$v->task_user_id]['assigned_user_email'] = $v->assigned_user_email;
            $by_project[$v->task_user_id]['full_name'] = $v->full_name;
            $by_project[$v->task_user_id]['tasks'][] = $v;
        }


        return $by_project;
    }

    /**
     * Retrieves all viewable tasks
     *
     * @access    public
     *
     * @param    int        Optional project id
     * @param    bool       The offset to start from
     *
     * @return    object    The result object
     */
    public function get_all_viewable($project_id = null, $is_viewable = true) {
        if ($is_viewable !== false) {
            $this->db->where($this->db->dbprefix($this->tasks_table) . '.is_viewable', 1);
        }

        $this->db->select('COUNT(' . $this->db->dbprefix('comments') . '.id) total_comments, project_task_statuses.title as status_title, project_task_statuses.background_color, project_task_statuses.font_color, project_task_statuses.text_shadow, project_task_statuses.box_shadow')
            ->join('comments', $this->db->dbprefix('comments') . '.item_id = ' . $this->tasks_table . '.id and ' . $this->db->dbprefix('comments') . '.is_private = 0 AND ' . $this->db->dbprefix('comments') . '.item_type = "task"', 'left')
            ->group_by($this->tasks_table . '.id');

        return $this->get_tasks_by_project($project_id, null, null, null, true);
    }

    public function get_comment_count($task_id) {
        where_assigned('project_tasks', 'read', 'item_id', 'comments');
        return $this->db->where('item_id', $task_id)->where('item_type', 'task')->count_all_results('comments');
    }

    function mark_as_billed($row_id, $task_id)
    {
        # Mark the task itself as billed.
        $this->db->where('id', $task_id)->update($this->table, ['invoice_item_id' => $row_id]);

        # Mark any time entries for this task as billed.
        $this->db->where('task_id', $task_id)->update($this->times_table, ['invoice_item_id' => $row_id]);
    }

    function mark_as_unbilled($row_ids) {
        if (!is_array($row_ids)) {
            $row_ids = array($row_ids);
        }
        if (count($row_ids) > 0) {
            return $this->db->where_in('invoice_item_id', $row_ids)->update($this->table, array('invoice_item_id' => '0'));
        }
    }

    public function get_flat_rates_for_billing($existing_invoice_rows = array()) {
        if (!in_array(0, $existing_invoice_rows)) {
            $existing_invoice_rows[] = 0;
        }

        $this->db->where_in('invoice_item_id', $existing_invoice_rows);
        $this->db->where("is_flat_rate", 1);
        $this->db->select("id, name, notes, rate, project_id");
        $buffer = $this->db->get("project_tasks")->result_array();
        $return = [];
        foreach ($buffer as $row) {
            if (!isset($return[$row['project_id']])) {
                $return[$row['project_id']] = [];
            }

            $return[$row['project_id']][$row['id']] = $row;
        }

        return $return;
    }

    public function get_for_billing($existing_invoice_rows = array()) {
        $CI = get_instance();
        $CI->load->model('projects/project_m');
        $CI->load->model('projects/project_time_m');
        $CI->load->model('projects/project_milestone_m');

        if (!in_array(0, $existing_invoice_rows)) {
            $existing_invoice_rows[] = 0;
        }

        $time_entries = $this->project_time_m->get_for_billing($existing_invoice_rows);
        $milestone_time_entries = array();

        if (count($time_entries) == 0) {
            return array();
        } else {

            $return = array();
            $milestones = [];
            $milestone_ids = array();
            $task_ids = array();
            $project_rates = $this->project_m->get_rates();

            foreach ($time_entries as $project_id => $times) {

                foreach (array_keys($times) as $task_id) {
                    $task_ids[] = $task_id;
                }

                if (isset($times[0])) {

                    if (!isset($return[(int) $project_id])) {
                        $return[(int) $project_id] = array(
                            'tasks' => new stdClass(),
                            'milestones' => new stdClass(),
                        );
                    }

                    # There is logged time for "no task", let's show it:
                    $return[$project_id]['tasks']->{0} = array(
                        'id' => 0,
                        'project_id' => $project_id,
                        'milestone_id' => 0,
                        'is_flat_rate' => false,
                        'name' => "No Task",
                        'notes' => '',
                        'rate' => isset($project_rates[$project_id]) ? $project_rates[$project_id] : 0,
                        'time_entries' => $times[0],
                    );
                }
            }

            where_assigned('project_tasks', 'read');
            $buffer = $this->db->select('id, project_id, is_flat_rate, milestone_id, name, rate, notes')->where_in('id', $task_ids)->get('project_tasks')->result_array();
            foreach ($buffer as $row) {
                # Cast to object for JSON purposes.

                if (!isset($time_entries[(int) $row['project_id']][(int) $row['id']])) {
                    # Removes task and time inconsistencies in custom-modified DBs.
                    continue;
                }

                $row['time_entries'] = (object) $time_entries[(int) $row['project_id']][(int) $row['id']];

                if (!isset($return[(int) $row['project_id']])) {
                    $return[(int) $row['project_id']] = array(
                        'tasks' => new stdClass(),
                        'milestones' => new stdClass(),
                    );
                }

                $task_id = (int) $row['id'];
                $milestone_id = (int) $row['milestone_id'];
                $project_id = (int) $row['project_id'];

                if (!isset($milestone_time_entries[$project_id])) {
                    $milestone_time_entries[$project_id] = array();
                }

                if (!isset($milestone_time_entries[$project_id][$milestone_id])) {
                    $milestone_time_entries[$project_id][$milestone_id] = array();
                }

                $milestone_time_entries[$project_id][$milestone_id] += $time_entries[$project_id][$task_id];
                if ($milestone_id > 0) {
                    $milestone_ids[$milestone_id] = $project_id;
                } else {
                    $milestones[] = array(
                        'id' => 0,
                        'name' => 'No Milestone',
                        'description' => '',
                        'project_id' => $project_id,
                    );
                }

                $return[$project_id]['tasks']->{$task_id} = $row;
                $return[$project_id]['milestones']->{$milestone_id} = $row;
            }

            $milestones = array_merge($milestones, $CI->project_milestone_m->get_milestones($milestone_ids));
            foreach ($milestones as $row) {
                # Cast to object for JSON purposes.
                $row['time_entries'] = (object) $milestone_time_entries[$row['project_id']][$row['id']];
                $row['is_flat_rate'] = false;
                $return[(int) $row['project_id']]['milestones']->{$row['id']} = $row;
            }

            return $return;
        }
    }

    function getClientIdById($id) {
        static $cache = null;
        if ($cache === null) {
            $cache = array();
            $buffer = $this->db->select('client_id, project_tasks.id')->join('projects', 'projects.id = project_id', 'left')->get($this->table)->result_array();
            foreach ($buffer as $row) {
                $cache[$row['id']] = (int) $row['client_id'];
            }
        }

        return isset($cache[$id]) ? $cache[$id] : 0;
    }

    function get_dropdown_per_project($include_completes = true) {
        where_assigned("project_tasks", "read");

        if (!$include_completes) {
            $this->db->where("completed", 0);
        }

        $results = $this->db
            ->order_by('project_id', 'asc')
            ->order_by('completed', 'asc')
            ->order_by('milestone_id', 'desc')
            ->order_by('parent_id', 'asc')
            ->order_by('project_tasks.name', 'asc')
            ->select('project_tasks.id, project_tasks.project_id, parent_id, project_tasks.name, milestone_id, project_milestones.name as milestone_name, completed')
            ->join('project_milestones', 'project_milestones.id = milestone_id', 'left')
            ->get('project_tasks')
            ->result_array();
        $return = array();
        $buffer = array();
        foreach ($results as $row) {
            if (!isset($return[$row['project_id']])) {
                $return[$row['project_id']] = array();
            }

            $buffer[$row['id']] = $row;
            $return[$row['project_id']][$row['id']] = $row['name'];
        }

        foreach ($return as $project_id => $tasks) {
            foreach ($tasks as $task_id => $task_name) {

                if ($buffer[$task_id]['parent_id'] > 0) {
                    $parent_id = (int) $buffer[$task_id]['parent_id'];
                    $loop = 0;
                    while ($parent_id > 0) {
                        if (!isset($buffer[$parent_id])) {
                            $parent_id = 0;
                        } else {
                            $task_name = $buffer[$parent_id]['name'] . " » " . $task_name;
                            if ($parent_id == $buffer[$parent_id]['parent_id']) {
                                $parent_id = 0;
                            } else {
                                $parent_id = (int) $buffer[$parent_id]['parent_id'];
                            }
                        }
                        $loop++;
                    }
                }

                if ($buffer[$task_id]['milestone_id'] > 0) {
                    $task_name = $task_name . " " . __('projects:milestone_identifier', array($buffer[$task_id]['milestone_name']));
                }

                $return[$project_id][$task_id] = $task_name;
            }
        }

        return $return;
    }

    public function get_processed_task_hours($task_id) {
        if (!can('read', $this->getClientIdById($task_id), 'project_tasks', $task_id)) {
            return '00:00';
        }

        $time = $this->project_time_m->get_tracked_task_time(null, $task_id, true);
        $task['tracked_hours'] = $time['time'];
        $buffer = $task['tracked_hours'];
        $buffer = explode('.', $buffer);
        $buffer_hours = ($buffer[0] > 9) ? $buffer[0] : '0' . $buffer[0];

        if (isset($buffer[1])) {
            $buffer[1] = '0.' . $buffer[1];
            $buffer[1] = (float) $buffer[1];
            $buffer[1] = round($buffer[1] * 60);

            $buffer_minutes = ($buffer[1] > 9) ? $buffer[1] : '0' . $buffer[1];
        } else {
            $buffer_minutes = '00';
        }

        return $buffer_hours . ':' . $buffer_minutes;
    }

    function get_all() {
        where_assigned('project_tasks', 'read');
        return parent::get_all();
    }

    public function get_tasks_and_times_by_project($project_id, $per_page = 10000000, $offset = 0, $get_time_stuff = true, $milestone_id = null, $parent_task_id = null, $force_all = false) {
        # This function has User Permissions.
        # Data fetched using functions in this function all respects User Permissions as necessary.
        # Just leaving this note here for future reference. - Bruno

        $this->load->model("projects/project_m");
        $project = $this->project_m->get_project_by_id($project_id)->row();

        # If a parent task ID is provided then obviously do not include
        # "No Task" time, because "No Task" does not exist, so it cannot
        # be the child task of any task.
        if ($parent_task_id) {
            $noTask = array(
                'time' => 0,
                'records' => array(),
            );
        } else {
            $noTask = $this->project_time_m->get_tracked_task_time($project_id, 0, true);
        }

        $concatenated_task_notes = $this->project_time_m->get_concatenated_time_entry_notes($project_id);

        // This will grab some time data for backend type stuff
        if ($get_time_stuff) {
            $this->db
                ->select('IF(start_time, 1, 0) as entry_started, start_time as entry_started_time, ' . $this->times_table . '.date as entry_started_date', false)
                ->join($this->times_table, $this->times_table . '.task_id = ' . $this->tasks_table . '.id AND end_time = "" ' . (logged_in() ? 'AND ' . $this->db->dbprefix($this->times_table) . '.user_id = "' . $this->current_user->id . '"' : ""), 'left');
        }

        if ($milestone_id !== null && $milestone_id >= 0) {
            $this->where('milestone_id', $milestone_id);
            $ignore_no_task = true;
        } else {
            $ignore_no_task = false;
        }

        if ($noTask['time'] > 0) {
            $tasks = $this->get_tasks_by_project($project_id, $per_page - 1, $offset - (1 * ($offset / $per_page)), $parent_task_id, $force_all);
        } else {
            $tasks = $this->get_tasks_by_project($project_id, $per_page, $offset, $parent_task_id, $force_all);
        }

        $buffer = $tasks;
        $tasks = array();

        if ($noTask['time'] > 0 and !$ignore_no_task) {
            $data = array(
                'tracked_hours' => $noTask['time'],
                'time_items' => $noTask['records'],
                'not_a_task' => true,
                'id' => 0,
                'completed' => 0,
                'milestone_id' => null,
                'is_viewable' => $project->is_viewable,
                'is_timesheet_viewable' => $project->is_timesheet_viewable,
                'notes' => isset($concatenated_task_notes[0]) ? $concatenated_task_notes[0] : '',
                'due_date' => 0,
                'rate' => $project->rate,
                'is_flat_rate' => false,
                'name' => 'No Task',
                'status_id' => 0,
                'status_title' => '',
                'background_color' => '',
                'font_color' => '',
                'projected_hours' => 0,
                'hours' => 0,
            );

            $buffer2 = $data['tracked_hours'];
            $buffer2 = explode('.', $buffer2);
            $buffer_hours = ($buffer2[0] > 9) ? $buffer2[0] : '0' . $buffer2[0];
            if (isset($buffer2[1])) {
                $buffer2[1] = '0.' . $buffer2[1];
                $buffer2[1] = (float) $buffer2[1];
                $buffer2[1] = round($buffer2[1] * 60);

                $buffer_minutes = ($buffer2[1] > 9) ? $buffer2[1] : '0' . $buffer2[1];
            } else {
                $buffer_minutes = '00';
            }
            $data['processed_tracked_hours'] = $buffer_hours . ':' . $buffer_minutes;
            $tasks[0] = $data;
        }

        foreach ($buffer as $task) {
            $records = $this->project_time_m->get_tracked_task_time($project_id, $task['id'], true);
            $task['tracked_hours'] = $records['time'];
            $buffer = $task['tracked_hours'];
            $buffer = explode('.', $buffer);
            $buffer_hours = ($buffer[0] > 9) ? $buffer[0] : '0' . $buffer[0];
            if (isset($buffer[1])) {
                $buffer[1] = '0.' . $buffer[1];
                $buffer[1] = (float) $buffer[1];
                $buffer[1] = round($buffer[1] * 60);

                $buffer_minutes = ($buffer[1] > 9) ? $buffer[1] : '0' . $buffer[1];
            } else {
                $buffer_minutes = '00';
            }
            $task['processed_tracked_hours'] = $buffer_hours . ':' . $buffer_minutes;
            $task['time_items'] = $records['records'];
            if (isset($concatenated_task_notes[$task['id']])) {
                $task['notes'] = trim($task['notes']);
                if (empty($task['notes'])) {
                    $task['notes'] = $concatenated_task_notes[$task['id']];
                } else {
                    $task['notes'] = $task['notes'] . "\n\n---\n\n" . $concatenated_task_notes[$task['id']];
                }
            }
            $tasks[$task['id']] = $task;
        }

        return $tasks;
    }

    // --------------------------------------------------------------------

    /**
     * Retrieves the project tasks, given a project, optionally limited and offset
     *
     * @access    public
     *
     * @param    int        The amount of results to return
     * @param    int        The offset to start from
     *
     * @return    object    The result object
     */
    public function get_tasks_by_parent($task_id = null, $limit = '*', $offset = '*') {
        $limit == '*' or $this->db->limit($limit, $offset);

        $this->db->where('task_id', $task_id);
        $this->db->order_by('completed ASC');
        $query = $this->db->get($this->tasks_table);

        if ($query->num_rows() > 0) {
            return $query;
        }
        return false;
    }

    // --------------------------------------------------------------------

    /**
     * Retrieves a certain number of upcoming tasks
     *
     * @access    public
     *
     * @param    int        The tast id
     *
     * @return    object    The result object
     */
    public function get_upcoming_tasks($count = 5) {
        where_assigned('project_tasks', 'read');

        $this->db
            ->select('project_tasks.*, projects.name as project_name')
            ->select('project_milestones.id as milestone_id, project_milestones.name as milestone_name, color as milestone_color')
            ->join('projects', 'project_tasks.project_id = projects.id')
            ->join('project_milestones', 'project_milestones.id = project_tasks.milestone_id', 'left')
            ->where('project_tasks.completed', 0)
            ->limit($count)
            ->order_by('due_date DESC');

        $query = $this->db->get($this->tasks_table);

        if ($query->num_rows() > 0) {
            return $query->result_array();
        }
        return false;
    }

    // --------------------------------------------------------------------

    /**
     * Retrieves a single tast by its ID
     *
     * @access    public
     *
     * @param    int        The tast id
     *
     * @return    object    The result object
     */
    public function get_task_by_id($task_id) {
        where_assigned('project_tasks', 'read');
        $this->db->where('id', $task_id);
        $this->db->limit(1);

        $query = $this->db->get($this->tasks_table);

        if ($query->num_rows() > 0) {
            return $query;
        }
        return false;
    }

    public function set_viewable($id, $is_viewable) {
        $task = (array) $this->get_by('id', $id);
        $this->project_m->set_viewable($task['project_id'], true);

        $this->db->where("id", $id);
        $this->db->update($this->tasks_table, [
            "is_viewable" => $is_viewable,
        ]);
    }

    function getProjectIdById($id) {
        $row = $this->db->select('project_id')->where('id', $id)->get($this->tasks_table)->row_array();
        if (isset($row['project_id'])) {
            return $row['project_id'];
        } else {
            return 0;
        }
    }

    function get_task_select_array($project_id) {
        $tasks_buffer = $this->db->where('project_id', $project_id)->order_by('name')->get($this->tasks_table)->result_array();
        $complete = array();
        $incomplete = array();
        foreach ($tasks_buffer as $row) {
            if ($row['completed']) {
                $complete[$row['id']] = $row['name'];
            } else {
                $incomplete[$row['id']] = $row['name'];
            }
        }
        return array(
            'complete' => $complete,
            'incomplete' => $incomplete,
        );
    }

    // --------------------------------------------------------------------

    /**
     * Returns a count of all tasks belonging to a projects
     *
     * @access    public
     *
     * @param   int    The id of the project
     *
     * @return    int
     */
    public function count_all_tasks($project_id = null, $milestone_id = null) {
        where_assigned('project_tasks', 'read');

        if ($project_id !== null) {
            $this->db->where('project_id', $project_id);
        }

        if ($milestone_id !== null) {
            $this->db->where('milestone_id', $milestone_id);
        }

        return $this->db->count_all_results($this->tasks_table);
    }

    function update($primary_value, $data, $skip_validation = false) {

        if (isset($data['assigned_user_id'])) {
            $data['assigned_user_id'] = (int) $data['assigned_user_id'];
        }

        if (isset($data['rate'])) {
            $data['rate'] = process_number($data['rate']);
        }

        if (isset($data['projected_hours']) && empty($data['projected_hours'])) {
            $data['projected_hours'] = 0;
        }

        return parent::update($primary_value, $data, $skip_validation);
    }

    // --------------------------------------------------------------------

    /**
     * Returns a count of all incomplete tasks belonging to a project
     *
     * @access    public
     *
     * @param   int    The id of the project
     *
     * @return    int
     */
    public function count_all_incomplete_tasks($project_id = null, $milestone_id = null) {
        where_assigned('project_tasks', 'read');

        if ($project_id !== null) {
            $this->db->where('project_id', $project_id);
        }

        if ($milestone_id !== null) {
            $this->db->where('milestone_id', $milestone_id);
        }

        return $this->db->where('completed', 0)->count_all_results($this->tasks_table);
    }

    /**
     * Used for imports, fetches a task by its name, creates a new one if none exist.
     *
     * @param id $task_name
     * @param id $project_id
     */
    function fetch_details($task_name, $project_id) {
        $result = $this->db->where('name', $task_name)->where('project_id', $project_id)->get($this->tasks_table)->row_array();
        if (!isset($result['id']) or empty($result['id'])) {
            $this->insert_task(array(
                'project_id' => $project_id,
                'name' => $task_name,
                'milestone_id' => 0,
                'rate' => 0.00,
            ));
        }

        return $this->db->where('name', $task_name)->get($this->tasks_table)->row_array();
    }

    public function search($query, $client_id = null, $project_id = null) {

        if ($client_id > 0) {
            $this->db->where("client_id", $client_id);
        }

        if ($project_id > 0) {
            $this->db->where("project_id", $project_id);
        }

        $clients = $this->db->select('project_tasks.id, project_tasks.name, project_tasks.project_id, client_id')->join("projects", "projects.id = project_id", "left")->get('project_tasks')->result_array();

        $buffer = array();
        $details = array();
        $full_details = array();
        $query = strtolower($query);

        $projects = get_dropdown("projects", "id", "name");
        $clients_names = get_dropdown("clients", "id", "client_name");

        foreach ($clients as $row) {
            $subbuffer = array();
            $subbuffer[] = levenshtein($query, strtolower($row['name']), 1, 20, 20);

            sort($subbuffer);

            $buffer[$row['id']] = reset($subbuffer);
            $details[$row['id']] = $row['name'];

            $row['project'] = isset($projects[$row['project_id']]) ? $projects[$row['project_id']] : __("global:nolongerexists");
            $row['client'] = isset($clients_names[$row['client_id']]) ? $clients_names[$row['client_id']] : __("global:nolongerexists");

            $full_details[$row['id']] = $row;
        }

        asort($buffer);
        $return = array();

        foreach (array_slice($buffer, 0, 3, true) as $id => $levenshtein) {
            $return[] = array(
                'levenshtein' => $levenshtein,
                'name' => $details[$id],
                'record' => $full_details[$id],
                'id' => $id,
            );
        }

        return $return;
    }

    // --------------------------------------------------------------------

    public function set_assigned_user($task_id, $assigned_user_id) {

        $assigned_user_id = fix_assigned($assigned_user_id);

        // special case to null, don't send email, quick return
        if ($assigned_user_id == "" || !is_numeric($assigned_user_id)) {
            $assigned_user_id = null;
            $this->update($task_id, array('assigned_user_id' => $assigned_user_id));
            return true;
        }

        $user = $this->ion_auth->get_user($assigned_user_id);
        if (!$user)
            return false;

        $this->update($task_id, array('assigned_user_id' => $assigned_user_id));

        # Limit the call to get_tasks_by_project() so it only fetches the one task.
        $this->db->where('project_tasks.id', $task_id);
        $task = array_reset($this->get_tasks_by_project(null, null, null, null, true));
        $project = $this->db->where('id', $task['project_id'])->get('projects')->row_array();
        $task['status'] = empty($task['status_title']) ? __('global:na') : $task['status_title'];
        $task['due_date'] = empty($task['due_date']) ? __('global:na') : format_date($task['due_date']);
        $task['projected_hours'] = empty($task['projected_hours']) ? __('global:na') : format_hours($task['projected_hours']);
        $task['notes'] = empty($task['notes']) ? '' : $task['notes'];

        if (current_user() != $assigned_user_id) {
            Pancake\Email\Email::send(array(
                'to' => $user->email,
                'template' => 'assigned_to_task',
                'client_id' => $project['client_id'],
                'data' => array(
                    'task' => $task,
                    'project' => $project,
                ),
            ));
        }

        return true;
    }

    public function insert($data, $skip_validation = false) {

        if (!isset($data['completed'])) {
            $data['completed'] = 0;
        }

        if (isset($data["due_date"]) && empty($data["due_date"])) {
            $data["due_date"] = 0;
        }

        return parent::insert($data, $skip_validation);
    }

    /**
     * Inserts a new task
     *
     * @access    public
     *
     * @param    array    The task array
     *
     * @return    int
     */
    public function insert_task($input) {
        if (!$this->validate($input)) {
            return false;
        }

        if (!isset($input['rate'])) {
            $project = $this->project_m->get_project_by_id($input['project_id'])->row_array();
            $rate = $project['is_flat_rate'] ? 0 : $project['rate'];
        } else {
            $rate = $input['rate'];
        }

        if (strlen($rate) === 0) {
            # Avoid non-numeric issue.
            $rate = 0;
        }

        $due_date = isset($input['due_date']) ? $input['due_date'] : 0;
        if (!empty($due_date)) {
            $due_date = carbon($due_date)->timestamp;
        } else {
            $due_date = 0;
        }

        $parent_task_id = isset($input['parent_task_id']) ? (int) $input['parent_task_id'] : 0;
        $milestone_id = isset($input['milestone_id']) ? (int) $input['milestone_id'] : 0;

        if (isset($input['assigned_user_id']) && is_numeric($input['assigned_user_id']) && $input['assigned_user_id'] > 0) {
            $assigned_user_id = (int) $input['assigned_user_id'];
        } else {
            $users = $this->db->dbprefix("users");
            $assigned_user_id = $this->db->query("select if((select count(0) from $users) > 1, 0, (select id from $users limit 1)) as assigned_user_id")->row_array();
            $assigned_user_id = $assigned_user_id['assigned_user_id'];
        }

        $insert_id = $this->insert(array(
            'owner_id' => current_user(),
            'project_id' => $input['project_id'],
            'name' => $input['name'],
            'due_date' => $due_date,
            'notes' => !empty($input['notes']) ? ($input['notes']) : '',
            'parent_id' => $parent_task_id,
            'rate' => $rate,
            'is_flat_rate' => isset($input['is_flat_rate']) ? $input['is_flat_rate'] : 0,
            'completed' => 0,
            'order' => $this->get_new_order($input['project_id']),
            'milestone_id' => $milestone_id,
            'projected_hours' => isset($input['projected_hours']) ? time_to_decimal($input['projected_hours']) : 0,
            'status_id' => isset($input['status_id']) ? $input['status_id'] : 0,
            'date_entered' => date('Y-m-d H:i:s'),
            'is_viewable' => (isset($input['is_viewable']) ? 1 : 0),
            'is_timesheet_viewable' => (isset($input['is_timesheet_viewable']) ? 1 : 0),
            'assigned_user_id' => $assigned_user_id,
        ), true);

        return $insert_id;

    }

    // --------------------------------------------------------------------

    /**
     * Updates a task
     *
     * @access    public
     *
     * @param    array    The task array
     *
     * @return    int
     */
    public function update_task($task, $ignore_is_viewable = false) {
        if (!isset($task['id'])) {
            return false;
        }

        $task_id = $task['id'];

        unset($task['id']);

        if (!$ignore_is_viewable) {
            $task['is_viewable'] = (isset($task['is_viewable']) ? 1 : 0);
            $task['is_timesheet_viewable'] = (isset($task['is_timesheet_viewable']) ? 1 : 0);
        }

        // Only do time_to_decimal if that field is present in the update $task
        if (isset($task['projected_hours'])) {
            $task['projected_hours'] = time_to_decimal($task['projected_hours']);
        }

        # Prevent Pancake from changing date_updated; this works automatically.
        unset($task['date_updated']);

        return $this->update($task_id, $task, true);
    }

    public function complete_task_children($task_id) {
        $this->db->where('parent_id', $task_id);
        $this->db->update($this->tasks_table, array('completed' => true, 'status_id' => 0));
    }

    // --------------------------------------------------------------------

    /**
     * Delete a task by the ID.
     *
     * @param integer $id
     *
     * @return bool
     */
    public function delete($id) {
        $this->load->model("projects/project_time_m");
        $this->load->model("projects/project_timers_m");

        $result = parent::delete($id);

        foreach ($this->db->select('id')->where('parent_id', $id)->get($this->tasks_table)->result_array() as $sub_task) {
            $this->delete($sub_task['id']);
        }

        $this->project_time_m->delete_by(["task_id" => $id]);
        $this->project_timers_m->delete_by(["task_id" => $id]);

        return $result;
    }

    function get_new_order($project_id) {
        $row = $this->db->select_max("order", "new_order")->where("project_id", $project_id)->get($this->tasks_table)->row_array();
        return ($row['new_order'] + 1);
    }

    function quick_add($name, $project_id, $milestone_id = null, $assigned_user_id = null) {
        $project_rate = $this->project_m->get_rates($project_id);
        $project = $this->project_m->get_project_by_id($project_id)->row_array();

        $due_date = $this->db->select('due_date')->where('id', $project_id)->get('projects')->row_array();
        $due_date = reset($due_date);

        $default_due_date = Settings::get('default_task_due_date');

        if ($default_due_date !== '') {
            $default_due_date = strtotime('+' . $default_due_date . ' days');
            if ($due_date > 0 and $default_due_date > $due_date) {
                $default_due_date = $due_date;
            }
        }

        $assigned_user_id = (int) $assigned_user_id;

        $insert_id = $this->insert(array(
            'owner_id' => current_user(),
            'project_id' => $project_id,
            'name' => $name,
            'due_date' => $default_due_date,
            'notes' => '',
            'parent_id' => 0,
            'is_flat_rate' => 0,
            'rate' => $project['is_flat_rate'] ? 0 : $project_rate,
            'completed' => 0,
            'milestone_id' => (int) $milestone_id,
            'projected_hours' => 0,
            'status_id' => 0,
            'date_entered' => date('Y-m-d H:i:s'),
            'is_viewable' => $project["is_viewable"],
            'is_timesheet_viewable' => $project["is_timesheet_viewable"],
            'assigned_user_id' => $assigned_user_id,
            'order' => $this->get_new_order($project_id),
        ), true);

        if ($insert_id && $assigned_user_id) {
            $this->set_assigned_user($insert_id, $assigned_user_id);
        }

        return $insert_id ? $insert_id : false;
    }

    function update_order($ids) {
        $data = array();
        foreach ($ids as $order => $id) {
            $data[] = array(
                "id" => $id,
                "order" => $order,
            );
        }
        $this->db->update_batch($this->tasks_table, $data, "id");
    }

    function update_position($task_id, $parent_id, $milestone_id) {
        $has_subtasks = $this->db->where('parent_id', $task_id)->count_all_results($this->tasks_table) > 0;

        $result = $this->db->where('id', $task_id)->update($this->tasks_table, array(
            'parent_id' => $parent_id,
            'milestone_id' => $milestone_id,
        ));

        if ($result) {
            # This fixes issues where sub-sub-tasks can be created when turning a task with subtasks into a subtask.
            # In JS, the UI turns the sub-sub-tasks into sub-tasks when they're moved.
            # This reflects that.
            $this->fix_sub_sub_child_tasks();

            # Update all of this task's subtasks so the milestones match.
            $this->db->where('parent_id', $task_id)->update($this->tasks_table, array(
                'milestone_id' => $milestone_id,
            ));
        }

        return $result;
    }

    function fix_sub_sub_child_tasks() {
        $project_tasks = $this->db->dbprefix("project_tasks");
        $data = $this->db->query("select a.id, if(a.id = b.parent_id, 0, b.parent_id) as parent_id from $project_tasks a left join $project_tasks b on a.parent_id = b.id where b.parent_id > 0")->result_array();
        foreach ($data as $row) {
            $this->db->where("id", $row['id'])->update("project_tasks", array("parent_id" => $row['parent_id']));
        }
    }

}

/* End of file: project_task_m.php */
