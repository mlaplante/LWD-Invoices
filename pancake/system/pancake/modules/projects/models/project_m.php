<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package     Pancake
 * @author      Pancake Dev Team
 * @copyright   Copyright (c) 2010, Pancake Payments
 * @license     http://pancakeapp.com/license
 * @link        http://pancakeapp.com
 * @since       Version 1.1
 */

// ------------------------------------------------------------------------

/**
 * The Project Model
 *
 * @subpackage  Models
 * @category    Payments
 *
 * @property Project_task_m $tasks
 */
class Project_m extends Pancake_Model {
    /**
     * @var string  The projects table name
     */
    protected $projects_table = 'projects';

    /**
     * @var string  The tasks table
     */
    protected $tasks_table = 'project_tasks';

    /**
     * @var string  The tasks table
     */
    protected $time_table = 'project_times';

    /**
     * @var array   The array of validation rules
     */
    protected $validate = array(
        array(
            'field' => 'client_id',
            'label' => 'Client',
            'rules' => 'required',
        ),
        array(
            'field' => 'name',
            'label' => 'Name',
            'rules' => 'required',
        ),
        array(
            'field' => 'description',
            'label' => 'Description',
            'rules' => 'xss_clean',
        ),
        array(
            'field' => 'is_viewable',
            'label' => 'Is Viewable?',
            'rules' => 'xss_clean',
        ),
    );

    protected $all_ids_cache;

    // --------------------------------------------------------------------

    /**
     * Retrieves the projects, optionally limited and offset
     *
     * @access  public
     *
     * @param   int     The amount of results to return
     * @param   int     The offset to start from
     *
     * @return  stdClass[]  All matching projects.
     */
    public function get_projects($limit = '*', $offset = '*', $client_id = null) {

        where_assigned('projects', 'read');

        if ($limit !== '*') {
            $this->db->limit($limit, $offset);
        }

        if ($client_id) {
            $this->db->where('projects.client_id', $client_id);
        }

        $query = $this->db
            ->select('projects.*, clients.first_name, clients.last_name, clients.email, clients.company, clients.phone, currencies.code as currency_code')
            ->order_by('date_entered', 'DESC')
            ->join('clients', 'projects.client_id = clients.id')
            ->join('currencies', 'projects.currency_id = currencies.id', 'left')
            ->get($this->projects_table);

        if ($query->num_rows() > 0) {
            $this->load->model('projects/project_task_m', 'tasks');
            $results = $query->result();

            $project_ids = [];
            foreach ($results as $row) {
                $project_ids[] = $row->id;
            }

            $this->db->where_in("project_id", $project_ids);
            $all_tasks = $this->project_task_m->get_all();
            $all_users = $this->user_m->get_all_with_meta();

            $tasks_by_project = [];
            $user_ids = [];
            foreach ($all_tasks as $task) {
                if (!isset($tasks_by_project[$task->project_id])) {
                    $tasks_by_project[$task->project_id] = [
                        "complete" => 0,
                        "incomplete" => 0,
                        "total" => 0,
                        "users" => [],
                    ];
                }

                if ($task->assigned_user_id && isset($all_users[$task->assigned_user_id])) {
                    $user_ids[$task->assigned_user_id] = $task->assigned_user_id;
                    $tasks_by_project[$task->project_id]["users"][$task->assigned_user_id] = $task->assigned_user_id;
                }

                if ($task->completed) {
                    $tasks_by_project[$task->project_id]["complete"]++;
                } else {
                    $tasks_by_project[$task->project_id]["incomplete"]++;
                }

                $tasks_by_project[$task->project_id]["total"]++;
            }

            foreach ($tasks_by_project as $project_id => $details) {
                foreach ($details["users"] as $key => $user_id) {
                    $tasks_by_project[$project_id]["users"][$key] = $all_users[$user_id];
                }
            }

            foreach ($results as &$row) {
                if (isset($tasks_by_project[$row->id])) {
                    $row->total_tasks = $tasks_by_project[$row->id]["total"];
                    $row->incomplete_tasks = $tasks_by_project[$row->id]["incomplete"];
                    $row->complete_tasks = $tasks_by_project[$row->id]["complete"];
                    $row->users = $tasks_by_project[$row->id]["users"];
                } else {
                    $row->total_tasks = 0;
                    $row->incomplete_tasks = 0;
                    $row->complete_tasks = 0;
                    $row->users = [];
                }
            }

            return $results;
        }

        return array();
    }

    function get_navbar_timers() {
        $this->load->model('projects/project_m');
        $this->load->model('projects/project_task_m');
        $this->db->where('completed', false);
        $this->db->where('is_archived', false);
        where_assigned('projects', 'read');
        $projects = $this->db->order_by("date_entered", "desc")->select("id, name")->get($this->projects_table)->result();
        $tasks_buffer = $this->db->select("id, project_id, name")->where("completed", 0)->order_by("date_entered", "desc")->get($this->tasks_table)->result_array();
        $tasks = array();
        foreach ($tasks_buffer as $task) {
            if (!isset($tasks[$task['project_id']])) {
                $tasks[$task['project_id']] = array();
            }
            $tasks[$task['project_id']][] = $task;
        }
        foreach ($projects as $key => $project) {
            if (isset($tasks[$project->id])) {
                $projects[$key]->tasks = $tasks[$project->id];
            } else {
                unset($projects[$key]);
            }
        }

        return $projects;
    }

    public function get_open_projects($limit = '*', $offset = '*', $client_id = null) {
        $this->db->where('completed', false);
        $this->db->where('is_archived', false);
        return $this->get_projects($limit, $offset, $client_id);
    }

    public function get_unarchived_projects($limit = '*', $offset = '*', $client_id = null) {
        $this->db->where('is_archived', false);
        return $this->get_projects($limit, $offset, $client_id);
    }

    public function get_unarchived_projects_for_search($limit = '*', $offset = '*', $client_id = null, $project_id = null) {
        where_assigned('projects', 'read');
        $this->db->where('is_archived', false);
        if ($project_id !== null) {
            $this->db->where('projects.id', $project_id);
        }
        return $this->get_projects($limit, $offset, $client_id);
    }

    public function get_projects_for_search($limit = '*', $offset = '*', $client_id = null, $project_id = null) {
        where_assigned('projects', 'read');
        if ($project_id !== null) {
            $this->db->where('projects.id', $project_id);
        }
        return $this->get_projects($limit, $offset, $client_id);
    }

    public function get_archived_projects($limit = '*', $offset = '*', $client_id = null) {
        $this->db->where('is_archived', true);
        return $this->get_projects($limit, $offset, $client_id);
    }

    public function get_comment_count($project_id) {
        where_assigned('projects', 'read', 'item_id', 'comments');
        return $this->db->where('item_id', $project_id)->where('item_type', 'project')->count_all_results('comments');
    }

    public function get_count_by_client($client_id) {
        static $cache = null;
        if ($cache === null) {
            $cache = array();
            $CI = get_instance();
            $CI->load->model('users/assignments');
            $ids = $CI->assignments->get_assigned_ids('projects', 'read');
            $projects = $this->db->dbprefix($this->projects_table);
            $assignments_sql = "";
            if (count($ids) > 0) {
                $assignments_sql = "where $projects.id in (" . implode(",", $ids) . ")";
            }
            $results = $this->db->query("select count(0) as count, client_id from $projects $assignments_sql group by client_id")->result_array();
            foreach ($results as $row) {
                $cache[$row['client_id']] = $row['count'];
            }
        }

        return isset($cache[$client_id]) ? $cache[$client_id] : 0;
    }

    function get_rates($id = null) {
        where_assigned('projects', 'read');

        $buffer = $this->db->select('id, rate')->get('projects')->result_array();
        $return = array();
        foreach ($buffer as $row) {
            $return[$row['id']] = $row['rate'];
        }

        return $id !== null ? $return[$id] : $return;
    }

    function get_for_dashboard() {
        $assigned_project_ids_buffer = $this->db->select("project_id")->where("completed", 0)->where("assigned_user_id", current_user())->get('project_tasks')->result_array();
        $assigned_project_ids = array();
        foreach ($assigned_project_ids_buffer as $row) {
            $assigned_project_ids[] = $row['project_id'];
        }

        $projects = array();

        if (count($assigned_project_ids)) {
            where_assigned('projects', 'read');
            $this->db->qb_orderby[] = "IF(due_date = 0, unix_timestamp(date_add(now(), interval 10 year)), due_date) asc";

            $this->db->where('completed', 0);
            $this->db->where('client_id >', 0);
            $this->db->where('is_archived', false);
            $projects = $this->db->limit(4)->where_in("id", $assigned_project_ids)->get("projects")->result_array();
        }

        return $projects;
    }

    // --------------------------------------------------------------------

    /**
     * Retrieves all viewable client projects
     *
     * @access  public
     *
     * @param   int     Optional client id
     * @param   bool    Whether the projects are viewable or not
     * @param   bool    Should we attach the related tasks?
     *
     * @return  object  The result object
     */
    public function get_all_viewable($client_id = null, $is_viewable = true, $get_tasks = true) {

        where_assigned('projects', 'read');

        if ($client_id !== null) {
            $this->db->where('projects.client_id', $client_id);
        }

        if ($is_viewable !== false) {
            $this->db->where('projects.is_viewable', 1);
            $this->db->where('projects.is_archived', 0);
        }

        $this->db->select('COUNT(' . $this->db->dbprefix('comments') . '.id) total_comments')
            ->join('comments', $this->db->dbprefix('comments') . '.item_id = projects.id and ' . $this->db->dbprefix('comments') . '.is_private = 0 AND ' . $this->db->dbprefix('comments') . '.item_type = "project"', 'left')
            ->group_by('projects.id');

        $projects = $this->get_projects();

        foreach ($projects as &$project) {

            if ($get_tasks !== false) {
                $this->load->model('project_task_m');

                $project->tasks = $this->project_task_m->get_all_viewable($project->id);

                $project->completed = true;
                foreach ($project->tasks as $task) {
                    if (!$task['completed']) {
                        $project->completed = false;
                        break;
                    }
                }

            }
        }

        return $projects;
    }

    public function get_completion_percent($project) {
        $this->load->model('project_task_m');
        $total_tasks = $this->project_task_m->count_all_tasks($project->id);
        if ($total_tasks != 0) {
            $incomplete_tasks = $this->project_task_m->count_all_incomplete_tasks($project->id);
            $complete_tasks = $total_tasks - $incomplete_tasks;
            return round(number_format(($complete_tasks / $total_tasks) * 100, 1));
        } else {
            return 0;
        }
    }

    public function create_from_template($template, $name, $client_id) {
        $proj_data = array(
            'client_id' => $client_id,
            'name' => $name,
            'description' => $template->description,
            'rate' => $template->rate,
            'currency_id' => $template->currency_id,
            'exchange_rate' => $template->exchange_rate,
            'is_viewable' => $template->is_viewable,
            'is_timesheet_viewable' => $template->is_timesheet_viewable,
            'is_flat_rate' => $template->is_flat_rate,
            'projected_hours' => $template->projected_hours,
        );

        $id = $this->insert($proj_data);

        $converted_milestone_ids = array();

        foreach ($template->milestones as $milestone) {
            $milestone = (array) $milestone;
            $milestone_id = $milestone['id'];
            $milestone['project_id'] = $id;
            unset($milestone['id']);
            $new_milestone_id = $this->project_milestone_m->insert($milestone);
            $converted_milestone_ids[$milestone_id] = $new_milestone_id;
        }

        foreach ($template->tasks as $task) {
            $_task_data = array(
                'project_id' => $id,
                'parent_id' => 0,
                'assigned_user_id' => $task->assigned_user_id,
                'name' => $task->name,
                'rate' => $task->rate,
                'hours' => $task->hours,
                'milestone_id' => isset($converted_milestone_ids[$task->milestone_id]) ? $converted_milestone_ids[$task->milestone_id] : 0,
                'notes' => $task->notes,
                'date_entered' => date('Y-m-d H:i:s'),
                'is_viewable' => $task->is_viewable,
                'is_timesheet_viewable' => $task->is_timesheet_viewable,
                'order' => $task->order,
                'is_flat_rate' => $task->is_flat_rate,
                'projected_hours' => $task->projected_hours,
                'status_id' => $task->status_id,
            );

            $_task_id = $this->project_task_m->insert($_task_data);
            foreach ($task->subtasks as $sub_task) {
                $_task_data = array(
                    'project_id' => $id,
                    'parent_id' => $_task_id,
                    'assigned_user_id' => $sub_task->assigned_user_id,
                    'name' => $sub_task->name,
                    'rate' => $sub_task->rate,
                    'hours' => $sub_task->hours,
                    'milestone_id' => isset($converted_milestone_ids[$sub_task->milestone_id]) ? $converted_milestone_ids[$sub_task->milestone_id] : 0,
                    'notes' => $sub_task->notes,
                    'date_entered' => date('Y-m-d H:i:s'),
                    'is_viewable' => $sub_task->is_viewable,
                    'is_timesheet_viewable' => $sub_task->is_timesheet_viewable,
                    'order' => $sub_task->order,
                    'is_flat_rate' => $sub_task->is_flat_rate,
                    'projected_hours' => $sub_task->projected_hours,
                    'status_id' => $sub_task->status_id,
                );
                $this->project_task_m->insert($_task_data);
            }
        }

        return $id;
    }

    /**
     * Get a project and all the necessary information to display it in the timesheet.
     *
     * @param string $unique_id
     *
     * @return array
     */
    public function getForTimesheet($unique_id, $task_id = null) {
        $buffer = $this->db->select('due_date, client_id, id, name, is_timesheet_viewable')->where('unique_id', $unique_id)->get($this->projects_table)->row_array();
        if (isset($buffer['id']) and !empty($buffer['id'])) {
            $CI = &get_instance();
            $client = (array) $CI->load->model('clients/clients_m')->get_by(array('id' => $buffer['client_id']));
            $buffer['client'] = $client;
            $tasks = $this->project_task_m->get_tasks_and_times_by_project($buffer['id'], 100000, 0);
            $tasks = array_filter($tasks, function($value) use ($buffer) {
                if ($value["is_timesheet_viewable"] === null) {
                    return $buffer["is_timesheet_viewable"];
                } else {
                    return (bool) $value["is_timesheet_viewable"];
                }
            });

            if ($task_id) {
                $tasks = array_filter($tasks, function($value) use ($buffer) {
                    return (!isset($value["not_a_task"]) || !$value["not_a_task"]);
                });
            }

            $tasks_dropdown = $this->project_task_m->get_dropdown_per_project(true);

            foreach ($tasks as $key => $task) {
                if ($task['id'] > 0) {
                    if ($task_id > 0 && $task['id'] != $task_id) {
                        unset($tasks[$key]);
                        continue;
                    }

                    $subtasks = $this->project_task_m->get_tasks_and_times_by_project($buffer['id'], 100000, 0, true, null, $task['id']);
                    $subtasks = array_filter($subtasks, function($value) use ($buffer) {
                        if ($value["is_timesheet_viewable"] === null) {
                            return $buffer["is_timesheet_viewable"];
                        } else {
                            return (bool) $value["is_timesheet_viewable"];
                        }
                    });

                    if (count($subtasks) > 0) {
                        foreach ($subtasks as $subtask) {
                            $subtask['name'] = $tasks_dropdown[$subtask['project_id']][$subtask['id']];
                            $tasks[$subtask['id']] = $subtask;
                        }
                    }
                }
            }

            $users = array();
            $minutes = 0;

            $times = array();
            $new_tasks = array();

            foreach ($tasks as $task) {
                foreach ($task['time_items'] as $item) {
                    $item["minutes"] = $this->project_time_m->get_rounded_minutes($item["minutes"]);
                    $users[$item['user_id']] = true;
                    $minutes = $minutes + $item['minutes'];
                    $times[strtotime(date('Y-m-d', $item['date'])) + ((int) str_ireplace(':', '', $item['start_time']))] = $item;
                }
                unset($task['time_items']);
                unset($task['entries']);
                $new_tasks[$task['id']] = $task;
            }

            ksort($times);

            $buffer['total_hours'] = round($minutes / 60, 2);
            $buffer['user_count'] = count($users);
            $buffer['tasks'] = $new_tasks;
            $buffer['times'] = $times;
            return $buffer;
        } else {
            return false;
        }
    }

    function get_all_ids() {
        if ($this->all_ids_cache === null) {
            $this->all_ids_cache = array();
            foreach ($this->db->select('id')->get($this->table)->result_array() as $row) {
                $this->all_ids_cache[$row['id']] = $row['id'];
            }
        }

        return $this->all_ids_cache;
    }

    /**
     * Get a list of projects and their names, per client.
     * If $project_id is provided, it will return the project's name, if one has access to it.
     *
     * @param integer $client_id
     * @param integer $project_id
     * @param bool $include_archived
     *
     * @return array|string|null
     */
    function get_dropdown_per_client($client_id = null, $project_id = null, $include_archived = true) {
        static $return = null;

        if ($return === null) {
            where_assigned('projects', 'read');
            if (!$include_archived) {
                $this->db->where('is_archived', 0);
            }
            $results = $this->db->order_by('client_id', 'asc')->order_by('is_archived', 'asc')->order_by('name', 'asc')->select('id, client_id, name, is_archived')->get('projects')->result_array();
            $return = array();
            foreach ($results as $row) {
                if (!isset($return[$row['client_id']])) {
                    $return[$row['client_id']] = array();
                }

                $return[$row['client_id']][$row['id']] = ($row['is_archived'] ? '[Archived] ' : '') . $row['name'];
            }
        }

        if ($client_id) {
            return $project_id ? $return[$client_id][$project_id] : $return[$client_id];
        } else {
            return $return;
        }
    }

    /**
     * Get all projects in a id => name dropdown.
     * Archived projects are included.
     *
     * @return array
     */
    function get_dropdown()
    {
        static $return = null;

        if ($return === null) {
            where_assigned('projects', 'read');
            $results = $this->db->order_by('name', 'asc')->select('id, is_archived, name')->get('projects')->result_array();
            $return = [];
            foreach ($results as $row) {
                $return[$row['id']] = ($row['is_archived'] ? '[Archived] ' : '') . $row['name'];
            }
        }

        return $return;
    }

    function get_ids_by_client($client_id) {
        $ids = array();
        foreach ($this->db->select('id')->where('client_id', $client_id)->get($this->table)->result_array() as $row) {
            $ids[] = $row['id'];
        }
        return $ids;
    }

    function getClientIdById($id) {
        $buffer = $this->db->select('client_id')->where('id', $id)->get($this->table)->row_array();
        return (int) (isset($buffer['client_id']) ? $buffer['client_id'] : 0);
    }

    public function getTotalHoursForProject($project_id, $formatted = false) {
        $buffer = $this->db->select('id')->where('id', $project_id)->get($this->projects_table)->row_array();
        if (isset($buffer['id']) and !empty($buffer['id'])) {
            $tasks = $this->project_task_m->get_tasks_and_times_by_project($buffer['id'], 10000000, 0, true, null, null, true);
            $minutes = 0;
            foreach ($tasks as $task) {
                foreach ($task['time_items'] as $item) {
                    $minutes = $minutes + $item['minutes'];
                }
            }

            $hours = round($minutes / 60, 2);

            if ($formatted) {
                $buffer = $hours;
                $buffer = explode('.', $buffer);
                $buffer_hours = ($buffer[0] > 9) ? $buffer[0] : '0' . $buffer[0];
                if (isset($buffer[1])) {
                    $buffer[1] = str_pad($buffer[1], 2, 0);
                    $buffer[1] = round(($buffer[1] * 60) / 100);
                    $buffer_minutes = ($buffer[1] > 9) ? $buffer[1] : '0' . $buffer[1];
                } else {
                    $buffer_minutes = '00';
                }

                return $buffer_hours . ':' . $buffer_minutes;
            } else {
                return $hours;
            }
        }

        return 0;
    }

    public function getTotalsForProject($project_id, $formatted = false) {

        if (!can('read', get_client('projects', $project_id), 'projects', $project_id)) {
            return array(
                'cost' => 0,
                'hours' => 0,
                'projected_hours' => 0,
                'expenses' => 0,
            );
        }

        $billed_hours = 0;
        $unbilled_hours = 0;
        $billed_cost = 0;
        $unbilled_cost = 0;

        $this->load->model('project_expense_m');

        if (!($project = $this->db->select('id, rate, projected_hours, is_flat_rate')->where('id', $project_id)->get($this->projects_table)->row())) {
            return 0;
        }

        $tasks = $this->project_task_m->get_tasks_and_times_by_project($project->id, 10000000, 0, true, null, null, true);
        $minutes = 0;
        $cost = $project->is_flat_rate ? $project->rate : 0;
        foreach ($tasks as $task) {
            $task_minutes = 0;
            $billed_minutes = 0;
            $unbilled_minutes = 0;

            foreach ($task['time_items'] as $item) {
                $task_minutes += $item['minutes'];
                $minutes += $item['minutes'];

                if ($item['invoice_item_id'] > 0) {
                    $billed_hours += $item['minutes'];
                    $billed_minutes += $item['minutes'];
                } else {
                    $unbilled_hours += $item['minutes'];
                    $unbilled_minutes += $item['minutes'];
                }
            }

            if (!$project->is_flat_rate) {
                if ($task['is_flat_rate']) {
                    $task_cost = $task['rate'];
                    if ($billed_minutes > 0) {
                        $billed_cost += $task_cost;
                    } else {
                        $unbilled_cost += $task_cost;
                    }
                    $cost += $task_cost;
                } elseif ($task_minutes > 0) {
                    $task_cost = (!empty($task['rate']) ? $task['rate'] : $project->rate);
                    $billed_cost += $task_cost * round($billed_minutes / 60, 2);
                    $unbilled_cost += $task_cost * round($unbilled_minutes / 60, 2);
                    $cost += $task_cost * round($task_minutes / 60, 2);
                }
            }
        }

        $hours = round($minutes / 60, 2);

        if ($formatted) {
            $buffer = $hours;
            $buffer = explode('.', $buffer);
            $buffer_hours = ($buffer[0] > 9) ? $buffer[0] : '0' . $buffer[0];
            if (isset($buffer[1])) {
                $buffer[1] = str_pad($buffer[1], 2, 0);
                $buffer[1] = round(($buffer[1] * 60) / 100);
                $buffer_minutes = ($buffer[1] > 9) ? $buffer[1] : '0' . $buffer[1];
            } else {
                $buffer_minutes = '00';
            }

            $hours = $buffer_hours . ':' . $buffer_minutes;
        }

        $expenses = $this->project_expense_m->get_sum_by_project($project->id);

        $billed_hours = $billed_hours / 60;
        $unbilled_hours = $unbilled_hours / 60;

        return array(
            'cost' => round($cost, 2),
            'hours' => $hours,
            'billed_hours' => $billed_hours,
            'unbilled_hours' => $unbilled_hours,
            'billed_cost' => $billed_cost,
            'unbilled_cost' => $unbilled_cost,
            'projected_hours' => $project->projected_hours,
            'expenses' => $expenses,
        );
    }

    // --------------------------------------------------------------------

    /**
     * Retrieves a project by its ID
     *
     * @access  public
     *
     * @param   int     The project id
     *
     * @return  object  The result object
     */
    public function get_project_by_id($project_id) {
        where_assigned('projects', 'read');
        $this->db
            ->select('projects.*, clients.first_name, clients.last_name, clients.email, clients.company, clients.phone, currencies.code as currency_code')
            ->where($this->projects_table . '.id', $project_id)
            ->join('clients', 'projects.client_id = clients.id')
            ->join('currencies', 'projects.currency_id = currencies.id', 'left');

        $query = $this->db->get($this->projects_table);

        if ($query->num_rows() > 0) {
            return $query;
        }
        return false;
    }

    public function get_associated_users($project_id) {
        $CI = &get_instance();
        $CI->load->model('users/user_m');
        $result = $this->db->select('assigned_user_id')->where('project_id', $project_id)->where('assigned_user_id !=', '')->get($this->tasks_table)->result_array();
        $users = array();
        foreach ($result as $row) {
            $users[] = $row['assigned_user_id'];
        }
        return $CI->user_m->get_users_by_ids($users);
    }

    public function set_viewable($project_id, $is_viewable) {
        $this->db->where("id", $project_id);
        $this->db->update($this->projects_table, [
            "is_viewable" => $is_viewable,
        ]);
    }

    public function search($query) {
        $clients = $this->db->select('id, name')->get($this->projects_table)->result_array();

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
                'id' => $id,
            );
        }

        return $return;
    }

    // --------------------------------------------------------------------

    /**
     * Returns a count of all the projects
     *
     * @access  public
     * @return  int
     */
    public function count_all_projects() {
        where_assigned('projects', 'read');
        $query = $this->db->count_all_results($this->projects_table);

        if ($query > 0) {
            return $query;
        }
        return false;
    }

    // --------------------------------------------------------------------

    /**
     * Inserts a new project
     *
     * @access  public
     *
     * @param   array   The image array
     *
     * @return  int
     */
    public function insert($input, $skip_validation = false) {
        // Get currency rate for historically accurate invoicing
        if (!empty($input['currency'])) {
            // show_error() was removed because it halted insert. Currency will fallback to default below.
            $currency = $this->db
                ->select('id, rate')
                ->where('code', $input['currency'])
                ->get('currencies')
                ->row();
        }

        $due_date = isset($input['due_date']) ? $input['due_date'] : 0;
        if (!empty($due_date)) {
            $due_date = carbon($due_date)->timestamp;
        } else {
            $due_date = 0;
        }

        return parent::insert(array(
            'owner_id' => current_user(),
            'client_id' => $input['client_id'],
            'name' => $input['name'],
            'due_date' => $due_date,
            'rate' => isset($input['rate']) ? process_number($input['rate']) : 0,
            'is_flat_rate' => isset($input['is_flat_rate']) ? $input['is_flat_rate'] : 0,
            'description' => isset($input['description']) ? $input['description'] : '',
            'projected_hours' => isset($input['projected_hours']) ? time_to_decimal($input['projected_hours']) : 0,
            'currency_id' => !empty($currency) ? $currency->id : 0,
            'exchange_rate' => !empty($currency) ? $currency->rate : 0,
            'date_entered' => time(),
            'completed' => isset($input['completed']) ? $input['completed'] : 0,
            'unique_id' => $this->_generate_unique_id(),
            'is_viewable' => isset($input['is_viewable']) ? $input['is_viewable'] : 0,
            'is_timesheet_viewable' => isset($input['is_timesheet_viewable']) ? $input['is_timesheet_viewable'] : 0,
            'is_archived' => isset($input['is_archived']) ? $input['is_archived'] : 0,
        ), $skip_validation);
    }

    /**
     * Generates the unique id for a project
     *
     * @access  public
     * @return  string
     */
    public function _generate_unique_id() {

        static $unique_ids = null;

        if ($unique_ids === null) {
            $buffer = $this->db->select('unique_id')->get($this->projects_table)->result_array();
            $unique_ids = array();

            foreach ($buffer as $row) {
                $unique_ids[$row['unique_id']] = $row['unique_id'];
            }
        }

        $this->load->helper('string');

        $valid = false;
        while ($valid === false) {
            $unique_id = random_string('alnum', 8);
            if (!isset($unique_ids[$unique_id])) {
                $valid = true;

                # Add this unique ID to list of IDs, because it'll be created.
                $unique_ids[$unique_id] = $unique_id;
            }
        }

        return $unique_id;
    }

    // --------------------------------------------------------------------

    /**
     * Updates a project
     *
     * @access  public
     *
     * @param   array   The project array
     *
     * @return  int
     */
    public function update($primary_value, $project, $skip_validation = false) {
        if ($primary_value == 0) {
            return false;
        }

        // Get currency rate for historically accurate invoicing
        if (isset($project['currency'])) {
            // show_error() was removed because it halted insert. Currency will fallback to default below.
            $currency = $this->db
                ->select('id, rate')
                ->where('code', $project['currency'])
                ->get('currencies')
                ->row();

            if (!empty($currency)) {
                $project['currency_id'] = $currency->id;
                $project['exchange_rate'] = $currency->rate;
            }

            unset($project['currency']);
        }

        $old_project = $this->db->where('id', $primary_value)->get($this->projects_table)->row_array();

        // Client ID not required for update
        if (isset($project['client_id']) && $old_project['client_id'] !== $project['client_id']) {
            # Move comments over.

            # Move comments belonging to this project over.
            $this->db->where('item_type', 'project')->where('item_id', $primary_value)->update('comments', array(
                'client_id' => $project['client_id'],
            ));

            $tasks = $this->db->select('id')->where('project_id', $primary_value)->get('project_tasks')->result_array();
            foreach ($tasks as $task) {
                $id = $task['id'];
                # Move comments belonging to this task over.
                $this->db->where('item_type', 'task')->where('item_id', $id)->update('comments', array(
                    'client_id' => $project['client_id'],
                ));
            }
        }

        // Only add due_date and projected_hours if they exist. We don't want to overwrite values
        if (isset($project['due_date'])) {
            $due_date = $project['due_date'];
            if (!empty($due_date)) {
                $due_date = carbon($due_date)->timestamp;
            } else {
                $due_date = 0;
            }

            $project['due_date'] = $due_date;
        }

        if (isset($project['projected_hours'])) {
            $project['projected_hours'] = time_to_decimal($project['projected_hours']);
        }

        // Make sure "Is Viewable?" is taken into account properly.
        $project['is_viewable'] = (isset($project['is_viewable']) && $project['is_viewable'] === '1') ? 1 : 0;
        $project['is_timesheet_viewable'] = (isset($project['is_timesheet_viewable']) && $project['is_timesheet_viewable'] === '1') ? 1 : 0;

        # Process rate.
        $project['rate'] = process_number($project['rate']);

        return parent::update($primary_value, $project, $skip_validation);
    }

    /**
     * Updates the given project(s) with no validation.
     *
     * @param array|int $where_or_id
     * @param array     $data
     * @param callable  $callback
     *
     * @return boolean
     */
    public function update_simple($where_or_id, $data, $callback = null) {
        $table = $this->db->dbprefix($this->table);

        if (is_numeric($where_or_id)) {
            $this->db->where("$table.id", $where_or_id);
        } else {
            $this->db->where($where_or_id);
        }

        $unique_ids = [];
        $previous_projects = [];
        $ids = array_map(function ($value) use (&$unique_ids, &$previous_projects) {
            $unique_ids[] = $value['unique_id'];
            $previous_projects[(int) $value['id']] = $value;
            return (int) $value['id'];
        }, $this->db->get($this->table)->result_array());

        if (count($ids)) {
            $result = $this->db->where_in("$table.id", $ids)->update($this->table, $data);

            if (is_callable($callback)) {
                call_user_func($callback);
            }

            foreach ($ids as $id) {
                $this->dispatch_return('model_update', [
                    'model' => $this,
                    'data' => $data,
                    'previous' => $previous_projects[$id],
                    'primary_key' => $id,
                ], 'array');
            }

            return $result;
        } else {
            return true;
        }
    }

    /**
     * Used for imports, fetches project by its name, creates a new one if none exist.
     *
     * @param string $project_name
     * @param id     $client_id
     */
    function fetch_details($project_name, $client_id) {
        $result = $this->db->where('name', $project_name)->where('client_id', $client_id)->get($this->projects_table)->row_array();
        if (!isset($result['id']) or empty($result['id'])) {
            $this->insert(array(
                'client_id' => $client_id,
                'name' => $project_name,
            ));
        }

        return $this->db->where('name', $project_name)->get($this->projects_table)->row_array();
    }

    // --------------------------------------------------------------------

    /**
     * Deletes a project by its ID
     *
     * @access  public
     *
     * @param   int     The project id
     *
     * @return  object  The result object
     */
    public function delete_project($project_id) {
        // delete all tasks and the project

        $this->db->where('project_id', $project_id)->delete($this->tasks_table);
        $this->db->where('project_id', $project_id)->delete($this->time_table);
        return $this->db->where('id', $project_id)->delete($this->projects_table);
    }

    public function delete_by_client($client_id) {
        $buffer = $this->db->select('id')->where('client_id', $client_id)->get($this->projects_table)->result_array();
        foreach ($buffer as $row) {
            $this->db->where('project_id', $row['id'])->delete($this->tasks_table);
            $this->db->where('project_id', $row['id'])->delete($this->time_table);
        }
        return $this->db->where('client_id', $client_id)->delete($this->projects_table);
    }

    /**
     * Archives a project by id
     */
    public function archive_project($project_id) {
        $this->db->where('id', $project_id)->update($this->projects_table, array('is_archived' => true));
    }

    public function unarchive_project($project_id) {
        $this->db->where('id', $project_id)->update($this->projects_table, array('is_archived' => false));
    }

    public function archived_project_count() {
        where_assigned('projects', 'read');
        return $this->db->where('is_archived', true)->from($this->projects_table)->count_all_results();
    }

    public function unarchived_project_count() {
        where_assigned('projects', 'read');
        return $this->db->where('is_archived', false)->from($this->projects_table)->count_all_results();
    }
}

/* End of file: project_m.php */
