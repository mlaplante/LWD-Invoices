<div id="header">
    <div class="row">
        <h2 class="ttl ttl3">Project: <?php echo $project->name; ?>
            <span style="font-size:0.5em; color: #ccc;">(<?php echo $completion_percent; ?>%)</span></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>

<div class="row">

    <?php /* --- [Being Main Content] --- */ ?>
    <div class="eight columns content-wrapper">
        <div class="project-group-list">
            <?php
            // Generic Project Task List
            $this->load->view('_projects_list')


            ?>
        </div><!-- /.project-group-list -->

        <?php if (count($milestones)): ?>
            <h4 class="sidebar-title"><?php echo __('global:milestones'); ?></h4>
            <div class="sortable-milestones" data-project-id="<?php echo $project->id; ?>" style="margin-bottom: 20px;">
                <?php foreach ($milestones as $milestone): ?>
                    <div class="sortable-milestone" data-milestone-id="<?php echo $milestone->id; ?>">
                        <a href='<?php echo site_url("admin/projects/milestones/view/" . $milestone->id); ?>'>
                            <div class="milestone-legend" style="background-color: <?php echo $milestone->color; ?>"></div> <?php echo $milestone->name; ?>
                        </a>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>


        <?php if (count($linked_invoices)): ?>
            <div class='project-info'><h3 class="project-title"><?php echo __("projects:project_invoices"); ?></h3></div>
            <?php $this->load->view('reports/table', array('rows' => $linked_invoices)); ?>
        <?php endif; ?>

        <?php if (count($linked_estimates)): ?>
            <div class='project-info'><h3 class="project-title"><?php echo __("projects:project_estimates"); ?></h3></div>
            <?php $this->load->view('reports/table', array('rows' => $linked_estimates)); ?>
        <?php endif; ?>

    </div><!-- /eight columns content-wrapper -->

    <div class="four columns side-bar-wrapper">

        <?php // $this->load->view('../../partials/_taskstatus') ?>

        <div class="panel project-details-panel">

            <!-- client -->

            <div class="client-details project-details-sidebar">

                <div class="row">
                    <div class="three columns mobile-two">
                        <div class="client-image">
                            <img src="<?php echo get_gravatar($project->email, '600'); ?>" alt="<?php echo $project->first_name . ' ' . $project->last_name; ?> image"/>
                        </div><!-- client-image -->
                    </div><!-- /two -->
                    <div class="nine columns mobile-two">
                        <h4 style="margin:0; font-size:1.25em">
                            <a href="<?php echo site_url('admin/clients/view/' . $project->client_id); ?>"><?php echo str_ireplace(" - ", "<br />", client_name($project->client_id)); ?></a>
                        </h4>

                        <p class="f-thin-grey no-bottom project-due-date"><?php echo ucfirst(__('partial:dueondate', [format_date($project->due_date)])); ?></p>
                    </div><!-- /ten -->
                </div><!-- /row -->

            </div>
            <!-- /client -->
            </div>

            <?php echo $extra_project_sidebar_info; ?>

            <?php $this->load->view("partials/quick_links", [
                "quick_links_owner" => "admin/projects/view",
                "data" => [
                    "id" => $project->id,
                    "client_id" => $project->client_id,
                    "is_archived" => $project->is_archived,
                    "has_tasks" => (count($tasks) > 0),
                ],
            ]); ?>

            <div class="panel">

            <?php if (is_admin()): ?>
                <div class="row content-wrapper">

                    <div class="twelve columns">

                        <h3 style="border-bottom:1px solid #5C5651"><i class="fa fa-picture-o"></i> Snapshot</h3>

                        <!-- /#CA6040 -->

                        <!-- due & comments -->
                        <div class="row">
                            <div class="six columns mobile-two">
                                <h5 style="font-weight: bold"><?php echo __('invoices:due') ?></h5>

                                <p class="f-thin-black no-bottom"><?php echo format_date($project->due_date); ?></p>
                            </div><!-- /six -->
                            <div class="six columns mobile-two">
                                <h5 style="font-weight: bold"><?php echo __('kitchen:comments') ?></h5>

                                <p class="f-thin-black no-bottom"><?php echo anchor(Settings::get('kitchen_route') . '/' . get_client_unique_id_by_id($project->client_id) . '/comments/project/' . $project->id, get_count('project_comments', $project->id)) ?></p>
                            </div><!-- /six -->
                        </div><!-- /row -->

                        <!-- hours & default rate -->
                        <div class="row">
                            <div class="six columns mobile-two">
                                <h5 style="font-weight: bold"><?php echo __('tasks:hours') ?></h5>

                                <p class="f-thin-black"><?php echo $totals['hours']; ?></p>
                            </div><!-- /six -->

                            <div class="six columns mobile-two">
                                <h5 style="font-weight: bold"><?php echo __('projects:projected') ?></h5>

                                <p class="f-thin-black"><?php echo format_hours($project->projected_hours); ?></p>
                            </div><!-- /six -->
                        </div>

                        <!-- billed and unbilled hours -->
                        <div class="row">
                            <div class="six columns mobile-two">
                                <h5 style="font-weight: bold"><?php echo __('tasks:billed_hours') ?></h5>

                                <p class="f-thin-black"><?php echo format_hours($totals['billed_hours']); ?></p>
                            </div><!-- /six -->

                            <div class="six columns mobile-two">
                                <h5 style="font-weight: bold"><?php echo __('tasks:unbilled_hours') ?></h5>

                                <p class="f-thin-black"><?php echo format_hours($totals['unbilled_hours']); ?></p>
                            </div><!-- /six -->
                        </div>

                        <?php if ($project->projected_hours > 0): ?>
                            <input class="knob dial" value="<?php echo $project->budget_percentage ?>" data-readonly="true" data-fgColor="<?php echo $project->budget_status_color ?>" data-bgColor="<?php echo $project->budget_status_bgcolor ?>" data-thickness=".4" data-min="<?php echo $project->budget_percentage_min ?>" data-max="<?php echo $project->budget_percentage_max ?>"/>
                        <?php endif; ?>

                        <?php if ($this->assignments->can_see_project_rates($project->id)): ?>

                            <div class="row">
                                <div class="six columns mobile-two">
                                    <h5 style="font-weight: bold"><?php echo __('invoices:total'); ?></h5>

                                    <p class="f-thin-black no-bottom"><?php echo Currency::format($totals['cost'], $project->currency_id); ?></p>
                                </div><!-- /six -->

                                <div class="six columns mobile-two">
                                    <h5 style="font-weight: bold"><?php echo __('items:expenses'); ?></h5>

                                    <p class="f-thin-black no-bottom"><?php echo Currency::format($totals['expenses'], $project->currency_id); ?></p>
                                </div><!-- /six -->
                            </div>

                            <div class="row">
                                <div class="six columns mobile-two">
                                    <h5 style="font-weight: bold"><?php echo __("global:unbilled_amount") ?></h5>

                                    <p class="f-thin-black no-bottom"><?php echo Currency::format($totals['unbilled_cost'], $project->currency_id); ?></p>
                                </div><!-- /six -->

                                <div class="six columns mobile-two">
                                    <h5 style="font-weight: bold"><?php echo __("global:billed_amount") ?></h5>

                                    <p class="f-thin-black no-bottom"><?php echo Currency::format($invoiced_amount, $project->currency_id); ?></p>
                                </div><!-- /six -->

                            </div>
                        <?php endif; ?>

                        <h4 class="sidebar-title"><?php echo __("projects:progress"); ?></h4>

                        <div class="progress-bar blue">
                            <span style="width: <?php echo $completion_percent; ?>%"><?php echo $completion_percent; ?>%</span>
                        </div>

                    </div><!-- /twelve columns -->
                </div><!-- /row -->

            <?php endif ?>
            <!-- /here -->
        </div><!-- /panel -->

    </div><!-- /three columns side-bar-wrapper -->

    <script type="text/javascript">
        $(".dial").knob();
    </script>