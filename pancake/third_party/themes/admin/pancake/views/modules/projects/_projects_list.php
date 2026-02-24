<?php
# Avoid "$is_milestone is not set" errors with a default value.
$is_milestone = isset($is_milestone) ? $is_milestone : false;
?>

<div class="project">

<h3><?php echo __('global:tasks'); ?></h3>
    <div class='project-tasks-jquery-load-container'>
        <ol class="project-tasks dashboard-task  container">
            <?php $task_i = 1; ?>
            <?php foreach ($milestones as $milestone): ?>
                <?php $has_tasks = ($milestone->tasks && count($milestone->tasks)); ?>
                <ol class='sortable milestone project-tasks  <?php echo $has_tasks ? 'has-tasks' : 'not-has-tasks' ?>' data-border-color='<?php echo $milestone->color; ?>' style="<?php echo $milestone->color ? "border-left: 4px solid {$milestone->color};" : ''; ?>" data-milestone-id='<?php echo $milestone->id; ?>'>
                    <?php if ($has_tasks): ?>
                        <?php foreach ($milestone->tasks as $task): ?>
                            <?php
                            $this->load->view("_task_row_new", array(
                                'is_subtask' => false,
                                'border_color' => $milestone->color,
                                'task' => $task,
                                'i' => $task_i
                            ));
                            ?>
                            <?php $task_i++; ?>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </ol>
            <?php endforeach; ?>
            <?php if (!$is_milestone): ?>
                <ol class='sortable not-milestone project-tasks' style="border-left: 4px solid #fff">
                    <?php foreach ($tasks as $task): ?>
                        <?php
                        $this->load->view("_task_row_new", array(
                            'is_subtask' => false,
                            'border_color' => '',
                            'task' => $task,
                            'i' => $task_i
                        ));
                        ?>
                        <?php $task_i++; ?>
                    <?php endforeach; ?>
                </ol>
            <?php endif; ?>
        </ol>
    </div>
    <ol class="project-tasks">
        <li class="task-item task-new">

            <?php if (can('create', get_client('projects', $project->id), 'project_tasks')): ?>
            <form method='post' class='form-holder the-task the-new-task task-quickadd' data-project-id='<?php echo $is_milestone ? $project->project_id : $project->id; ?>' action='<?php echo site_url('admin/projects/tasks/quick_add') ?>'>
                <span class="task-number"><i class="fi-plus"></i></span>
                <?php if (!$is_milestone): ?>
                    <?php if (count($milestones_select) > 1): ?>
                        <span class="task-milestone-add">
                            <span class="sel-item dropdown-arrow">
                                <?php echo form_dropdown('milestone_id', $milestones_select); ?>
                            </span>
                        </span>
                    <?php endif; ?>
                <?php else: ?>
                    <input type='hidden' name='milestone_id' value='<?php echo $project->id ?>'>
                <?php endif; ?>
                <?php if (count($users_select) > 2): ?>
                    <span class="task-assignee-add">
                        <span class="sel-item dropdown-arrow">
                            <?php echo form_dropdown('assigned_user_id', $users_select); ?>
                        </span>
                    </span>
                <?php endif; ?>
                <span class="task-title-add"><input type="text" class='task-quickadd-name' name="task" placeholder="<?php echo __('projects:add_new_task'); ?>" value="" /></span>
            </form>

        <?php endif ?>
        </li>
    </ol>
</div><!-- /project -->



