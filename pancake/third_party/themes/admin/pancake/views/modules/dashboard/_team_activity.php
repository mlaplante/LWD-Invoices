<?php if (count($team_working_on)): ?>
    <div class="<?php echo isset($view_all) ? "view-all" : ""; ?>" id="my-teams">
        <ul class="team-activity">
            <?php foreach ($team_working_on as $key => $user): ?>
                <li>
                    <h5>
                        <img src="<?php echo get_gravatar($user['assigned_user_email'], 40) ?>" class="avatar"/>
                        <?php echo ucwords($user['full_name']); ?>
                    </h5>
                    <ul class="tasks">
                        <?php foreach ($user['tasks'] as $task): ?>
                            <li>
                                <span class="task-name"><?php echo $task->task_name; ?></span> for
                                <a href="<?php echo site_url('/admin/projects/view/' . $task->project_id); ?>" class="project">
                                    <?php echo $task->project_name; ?>
                                </a>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                </li>
            <?php endforeach; ?>
        </ul>
        <?php if (!isset($view_all) or $view_all): ?>
            <a href="<?php echo site_url("admin/dashboard/all_team_activity") ?>" class="view-more"><?php echo __("dashboard:view_all_team_activity") ?> <i class="fi-arrow-right"></i></a>
            <?php endif; ?>
    </div>
<?php else: ?>
<?php echo __("global:there_is_no_activity"); ?>
<?php endif; ?>