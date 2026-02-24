<?php

$is_dashboard = isset($is_dashboard) ? $is_dashboard : false;

?>


<<?php echo $is_dashboard ? "div" : "li"; ?> id="task-row-<?php echo $task['id']; ?>" data-parent-id='<?php echo $task['parent_id']; ?>' class="<?php echo $task['status_title'] ? url_title($task['status_title'], '-', true) : ''; ?> task-item">
<div class="row dashboard-task <?php echo ($task['due_date'] > time()) ? "not-due" : "overdue"; ?> task-<?php echo $task['id'] ?>" style="margin-bottom: 0.5em" >

    <div class="twelve columns">

        <div class="row top-row">
            <div class="one complete-checkbox-container columns <?php echo $is_subtask ? "offset-by-one" : ""; ?>" style="text-align:center " >
                <a href="#" title="<?php echo __("tasks:complete_this_task"); ?>" class="task-checkmark complete-check <?php echo ((bool) $task['completed'] ? 'checked' : '') ?>" style="font-size: 1.5em; color:#ccc;" data-task-id="<?php echo $task['id']; ?>"><i class="fa check-open"></i></a>
            </div><!-- /one columns -->

            <div class=" <?php echo ($is_subtask or $is_dashboard) ? "seven" : "eight"; ?> task-title-container columns">
                <p class="no-bottom" style="font-size: 1.2em; margin:0">

                    <?php if ($task['status_title']): ?>
                <span class="task-tag tag-<?php echo $task['status_id'] ?>" style="color: <?php echo $task['font_color'] ?>; background: <?php echo $task['background_color'] ?>; text-shadow: 1px 1px <?php echo $task['text_shadow'] ?>; -webkit-box-shadow:0px 1px 1px 0px <?php echo $task['box_shadow'] ?>; -moz-box-shadow:0px 1px 1px 0px <?php echo $task['box_shadow'] ?>; box-shadow: 0px 1px 1px 0px <?php echo $task['box_shadow'] ?>" ><?php echo $task['status_title'] ?></span>
                    <?php endif ?> 
                
                <?php if (isset($task['assigned_user_email']) and $task['assigned_user_email']): ?>
            <span class="task-assignee">
                <img class="avatar" src="<?php echo get_gravatar($task['assigned_user_email'], '40') ?>" />
            </span>
        <?php endif; ?>
                
                <span class="js-task-complete-status task-name <?php echo ((bool) $task['completed']) ? 'completed' : 'incomplete'; ?>"><?php echo $task['name']; ?><?php echo $is_dashboard ? "<small>{$task['project_name']}</small>" : ""; ?></span></p>

            </div><!-- /six columns -->
            <div class="<?php echo $is_dashboard ? "three" : "two"; ?> columns">
                <span class="task-info">
                            <span class="task-timer timer" <?php timer($timers, $task['id']); ?>>
                                <span class="track-time" data-task-id="<?php echo $task['id']; ?>" data-project-id="<?php echo $task['project_id'] ?>" data-time-start="<?php echo isset($task['entry_started']) && $task['entry_started'] ? strtotime(date('Y-m-d', $task['entry_started_date']) . ' ' . $task['entry_started_time']) . '000' : '' ?>">
                                    <span class="time time-ticker timer-time">00:00:00</span>
                                    <a href="#" class="<?php echo isset($task['entry_started']) && $task['entry_started'] ? 'pause' : 'play' ?> timer-button" title="<?php echo __('global:start') ?>" data-start="<?php echo __('global:start') ?>" data-stop="<?php echo __('global:stop') ?>"><i class="fi-play"></i><i class="fi-pause"></i></a>
                                    <a href="#" class="stop timer-button" title="<?php echo __('global:stop') ?>"><i class="fi-stop"></i></a>
                                </span>
                            </span>
                            
                </span>



            </div><!-- /three columns -->

            <div class="one columns">
                <a href="#" data-task-note='task-note-<?php echo $task['id'] ?>' class="task-toggle"><i class="fa fa-chevron-down"></i></a>
            </div>
            
        </div><!-- /row -->

        <div class="row">
            <div class="one columns"></div>
            <div id="task-note-<?php echo $task['id'] ?>" class="task-notes eleven columns" style="border-top:1px solid #ccc; display:none">

				<div class="row">
					<div class="nine columns">


						<p class="task-meta">
<?php if ($task['is_viewable']): ?>
							<a href="#" title="<?php echo __('global:viewable'); ?>"><i class="fa fa-eye"></i></a>
<?php endif; ?>
                                                        <span class="overdue"><i class="fa fa-calendar"></i> <?php echo format_date($task['due_date']); ?></span>  <i class="fa fa-star-o"></i> <strong><?php echo format_hours($task['projected_hours']); ?></strong> <i class="fa fa-clock-o"></i> <strong><?php echo get_instance()->project_task_m->get_processed_task_hours($task['id']); ?></strong>


						<span class=""
						</p>
					</div><!-- /eight columns -->

					<div class="three columns">
					<span class="task-tools">
		            <a title="<?php echo __('tasks:view_entries'); ?>" href="<?php echo site_url('admin/projects/times/view_entries/task/' . $task['id']); ?>"><i class="fi-clock"></i></a>
		            <a title="<?php echo __("tasks:discuss_task"); ?>" href="<?php echo site_url('/admin/projects/tasks/discussion/' . $task['id']); ?>"><i class="fi-comment"></i></a>
		            <?php if (can('update', get_client('project_tasks', $task['id']), 'project_tasks', $task['id'])): ?>
		                <a class="fire-ajax" title="<?php echo __('projects:role_edit_task'); ?>" href="<?php echo site_url('admin/projects/tasks/edit/' . $task['id']) ?>"><i class="fi-pencil"></i></a>
		            <?php endif; ?>
		            <?php if (can('delete', get_client('project_tasks', $task['id']), 'project_tasks', $task['id'])): ?>
		                <a title="<?php echo __('projects:role_delete_task'); ?>" href="#" class="js-delete-task" data-task-id="<?php echo $task['id']; ?>"><i class="fi-x"></i></a>
		            <?php endif; ?>
		            <form action="<?php echo site_url('/admin/projects/tasks/delete/' . $task['id']); ?>" method="post" class="confirm-form" id="delete-task-<?php echo $task['id']; ?>"></form>
	        	</span>

					</div><!-- /four columns -->

				</div><!-- /row -->
                
					



                </p>
                <?php if($task['notes'] == ''): ?>
                	<p><a class="fire-ajax" href="<?php echo site_url('admin/projects/tasks/edit/' . $task['id']) ?>"><i class="fa fa-plus"></i> <?php echo __("tasks:add_notes"); ?></a></p>
                <?php else: ?>
                <?php echo auto_typography(htmlspecialchars($task['notes'])); ?>
            <?php endif ?>
            </div><!-- /eleven -->
        </div><!-- /row -->

    </div><!-- /twelve columns -->

</div><!-- /row dashboard-task -->
<?php if (!$is_dashboard): ?>
    <?php if (!$is_subtask): ?>
            <div class='clear'></div>
            <?php $has_tasks = (array_key_exists('subtasks', $task) and count($task['subtasks']) > 0); ?>
            <ol class='sortable task project-tasks <?php echo $has_tasks ? 'has-tasks' : 'not-has-tasks' ?>' data-border-color='<?php echo $border_color;?>' data-task-id='<?php echo $task['id']; ?>'>
                <?php if ($has_tasks): ?>
                    <?php foreach ($task['subtasks'] as $subtask): ?>
                        <?php
                        $this->load->view("_task_row_new", array(
                            'is_subtask' => true,
                            'border_color' => $border_color,
                            'task' => $subtask
                        ));
                        ?>
                    <?php endforeach; ?>

                <?php endif; ?>
            </ol>
        <?php endif; ?>
            <?php endif; ?>
    </<?php echo $is_dashboard ? "div" : "li"; ?>>