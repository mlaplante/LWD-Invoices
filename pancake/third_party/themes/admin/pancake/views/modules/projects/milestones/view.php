<div id="header">
    <div class="row">
        <h2 class="ttl ttl3">Project: <?php echo $project->name; ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>

<div class="row">
    <div class="nine columns content-wrapper">	

        <div class="project-info">
            <h3 class="project-title">Milestone Tasks</h3>
            <?php if ($project->description): ?>
                <strong>Notes:</strong>
                <?php echo auto_typography($project->description); ?>
            <?php endif; ?>
        </div>

        <?php if (count($tasks)): ?>
            <div class="project-filter" id="filter">
                <p><strong>Filter: </strong></span>
                    <a href="#" id="no-filter" class="current project-task-filter">Show All</a>
                    <?php foreach ($task_status_types as $key => $type): ?>
                        <a href="#" id="status-<?php echo $key + 1; ?>" class="filter project-task-filter" data-filter='<?php echo url_title($type->title, '-', true); ?>'><?php echo $type->title; ?></a>
                    <?php endforeach; ?>
                </p>
            </div><!-- /filter -->
            <div class="project-group-list">
                <?php
                $milestone->tasks = $tasks;

                // Generic Project Task List
                $this->load->view('_projects_list', array(
                    'project' => $milestone,
                    'milestones' => array($milestone),
                    'is_milestone' => true
                ))
                ?>
            </div><!-- /.project-group-list -->
        <?php else: ?>

            <div class="invoice-block">
                <div class="reminder_notification">
                    <h4><?php echo __('tasks:no_task_title') ?></h4>
                    <p><?php echo __('tasks:no_task_message') ?></p>
                </div>
            </div>    	

        <?php endif; ?>
    </div>

    <div class="three columns side-bar-wrapper">
        <div class="panel">
            <h5><?php echo __('global:client') ?></h5>
            <p class="f-thin-black no-bottom"><?php echo $project->first_name; ?> <?php echo $project->last_name; ?></p>
            <p class="f-thin-grey no-bottom"><?php echo $project->company; ?> </p>


            <h5><?php echo __('projects:project') ?></h5>
            <p class="f-thin-black no-bottom black-link"><?php echo anchor('admin/projects/view/' . $project->id, $project->name); ?></p>

            <h5><?php echo __('milestones:target_date') ?></h5>
            <p class="f-thin-black"><?php echo format_date($milestone->target_date); ?></p>

            <!-- start buttons -->
            <ul class="side-bar-btns">
                <li class="add"><a href="<?php echo site_url('admin/projects/tasks/create/' . $project->id . '/' . $milestone->id); ?>" class="fire-ajax"><span><?php echo __('tasks:create') ?></span></a></li>	
            </ul><!-- /side-bar-btns-->

            <div class="row edit-delete">
                <div class="six columns">
                    <a class="fire-ajax" href="<?php echo site_url('admin/projects/milestones/edit/' . $milestone->id); ?>"><span><?php echo __('milestones:edit') ?></span></a>
                </div>

                <div class="six columns align-right">
                    <a href="<?php echo site_url('admin/projects/milestones/delete/' . $milestone->id); ?>"><span><?php echo __('milestones:delete') ?></span></a>
                </div>
            </div><!-- /row edit-delete -->
        </div>
    </div>
</div>

<script type="text/javascript">
    $(".fire-ajax").click(function(e) {
        $('#ajax_container').hide();
        e.preventDefault();
        $.get($(this).attr('href'), function(data) {
            $('#ajax_container').html(data).slideDown();
        });
    });

</script>