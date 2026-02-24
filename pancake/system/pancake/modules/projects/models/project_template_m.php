<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package     Pancake
 * @author      Pancake Dev Team
 * @copyright   Copyright (c) 2010, Pancake Payments
 * @license     http://pancakeapp.com/license
 * @link        http://pancakeapp.com
 * @since       Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * The Item Model
 *
 * @subpackage  Models
 * @category    Project
 */
class Project_template_m extends Pancake_Model {

    public function __construct()
    {
        parent::__construct();
        $this->load->model('projects/project_task_m');
        $this->load->model('projects/project_expense_m');
        $this->load->model('projects/project_task_template_m');
    }

    // This could be DRYed up. But it works for now.
    public function get($id)
    {
        $template = parent::get($id);
        if ($template)
        {
            
            $template->milestones = $this->db->where("project_id", $template->id)->get("project_milestone_templates")->result();
            
            $template->tasks = array();
            $parent_tasks = $this->project_task_template_m->get_many_by(array('project_id' => $template->id, 'parent_id' => 0));
            foreach($parent_tasks as $task) {
                $template->tasks[$task->id] = $task;
                $template->tasks[$task->id]->subtasks = array();

                $_task_children = $this->project_task_template_m->get_many_by(array('parent_id' => $task->id));
                foreach($_task_children as $_child)
                {
                    $template->tasks[$task->id]->subtasks[] = $_child;
                }
            }
        }

        return $template;
    }
    
    function delete($id) {
        $this->db->where("project_id", $id)->delete("project_milestone_templates");
        $this->db->where("project_id", $id)->delete("project_task_templates");
        return $this->db->where("id", $id)->delete("project_templates");
    }
    
    function get_dropdown() {
        $dropdown_array = array('0' => __('global:select'));
        
        $templates = $this->db->select("id, name")->get("project_templates")->result_array();
        foreach ($templates as $template) {
            $dropdown_array[$template['id']] = $template['name'];
        }
        
        return $dropdown_array;
    }

    public function create_from_project($project)
    {
        // create new project template
        $template_data = array(
            'client_id'     => $project->client_id,
            'name'          => $project->name,
            'description'   => $project->description,
            'rate'          => $project->rate,
            'currency_id'   => $project->currency_id,
            'exchange_rate' => $project->exchange_rate,
            'is_viewable'   => $project->is_viewable,
            'is_timesheet_viewable'   => $project->is_timesheet_viewable,
            'is_flat_rate'  => $project->is_flat_rate,
            'projected_hours' => $project->projected_hours,
        );

        $proj_id = $this->insert($template_data);
        
        $milestones = $this->project_milestone_m->get_milestones_by_project($project->id);
        
        $converted_milestone_ids = array();
        
        foreach ($milestones as $milestone) {
            $data = array(
                "name" => $milestone->name,
                "description" => $milestone->description,
                "project_id" => $proj_id,
                "assigned_user_id" => fix_assigned($milestone->assigned_user_id),
                "color" => $milestone->color,
                "is_viewable" => $milestone->is_viewable,
                "order" => $milestone->order,
            );
            
            $this->db->insert("project_milestone_templates", $data);
            $converted_milestone_ids[$milestone->id] = $this->db->insert_id();
        }

        // create new project tasks templates
        $parent_tasks = $this->project_task_m->get_many_by(array('project_id' => $project->id, 'parent_id' => 0));
        foreach ($parent_tasks as $task)
        {
            $_template_task_data = array(
                'project_id' => $proj_id,
                'parent_id' => 0,
                'assigned_user_id' => fix_assigned($task->assigned_user_id),
                'name' => $task->name,
                'rate' => $task->rate,
                'hours' => $task->hours,
                'notes' => $task->notes,
                'milestone_id' => isset($converted_milestone_ids[$task->milestone_id]) ? $converted_milestone_ids[$task->milestone_id] : 0,
                'is_viewable' => $task->is_viewable,
                'is_timesheet_viewable'   => $task->is_timesheet_viewable,
                'is_flat_rate' => $task->is_flat_rate,
                'projected_hours' => $task->projected_hours,
                'status_id' => $task->status_id,
                "order" => $task->order,
            );
            // create a new project_template_task
            $_task_id = $this->project_task_template_m->insert($_template_task_data);

            // does this task have children? add them.
            $_task_children = $this->project_task_m->get_many_by(array('parent_id' => $task->id));
            if (count($_task_children) > 0)
            {
                foreach ($_task_children as $_child)
                {
                    $_child_template_task_data = array(
                        'project_id' => $proj_id,
                        'parent_id' => $_task_id,
                        'assigned_user_id' => fix_assigned($_child->assigned_user_id),
                        'name' => $_child->name,
                        'rate' => $_child->rate,
                        'hours' => $_child->hours,
                        'notes' => $_child->notes,
                        'milestone_id' => isset($converted_milestone_ids[$_child->milestone_id]) ? $converted_milestone_ids[$_child->milestone_id] : 0,
                        'is_viewable' => $_child->is_viewable,
                        'is_timesheet_viewable'   => $_child->is_timesheet_viewable,
                        "order" => $_child->order,
                    );
                    $this->project_task_template_m->insert($_child_template_task_data);
                }
            }
        }
        return $proj_id;
    }

}

/* End of file: project_expense_m.php */