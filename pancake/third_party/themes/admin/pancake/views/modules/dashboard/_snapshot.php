<div class="snapshot">
    <p class="since"><?php echo __("dashboard:since_explanation", array(anchor("admin/settings", format_date(Settings::fiscal_year_start()))))?></p>

    <div class="row">
        <div class="six columns paid">
            <h5><?php echo __("global:paid"); ?></h5>
            <h4>
                <i class="fa fa-check-circle"></i>
                <a href="<?php echo site_url('reports/payments/view/from:' . Settings::fiscal_year_start()->timestamp . '-to:0-client:0'); ?>"><?php echo Currency::format($paid); ?></a>
            </h4>
        </div>
        <div class="six columns overdue">
            <h5><?php echo __("global:overdue"); ?></h5>
            <h4>
                <i class="fa fa-exclamation-circle"></i>
                <a href="<?php echo site_url('admin/invoices/overdue'); ?>"><?php echo Currency::format($overdue); ?></a>
            </h4>
        </div>
        <div class="six columns outstanding">
            <h5><?php echo __("dashboard:outstanding"); ?></h5>
            <h4>
                <a href="<?php echo site_url('admin/invoices/unpaid'); ?>"><?php echo Currency::format($outstanding); ?></a>
            </h4>
        </div>
        <div class="six columns unpaid">
            <h5><?php echo __("global:unpaid"); ?></h5>
            <h4>
                <a href="<?php echo site_url('admin/invoices/all_unpaid'); ?>"><?php echo Currency::format($unpaid); ?></a>
            </h4>
        </div>
    </div>

    <hr/>

    <div class="row">
        <div class="twelve columns">
            <h5>
                <a href="<?php echo site_url("admin/timesheets/filter/all/" . Settings::fiscal_year_start()->format("Y-m-d")); ?>">
                    <?php echo __('projects:hours_worked_short') ?><br/>
                    <span>
                        <i class="fa fa-clock-o" title="<?php echo __("tasks:total_logged_time"); ?>"></i> <?php echo $hours_worked; ?>
                        <?php if ($has_rounding): ?>
                            <i class="fa fa-money" title="<?php echo __("timesheets:rounded_time", array(format_hours(Settings::get("task_time_interval"))))?>"></i> <?php echo $rounded_hours_worked; ?>
                        <?php endif; ?>
                    </span>
                </a>
            </h5>
        </div>
    </div>

    <hr/>

    <div class="row">
        <div class="six columns">
            <h5>
                <a href="<?php echo site_url('admin/projects/') ?>" title="<?php echo __('projects:totalprojects') ?>">
                    <?php echo __('projects:totalprojects') ?><br/>
                    <span><?php echo ($project_count >= 1) ? $project_count : "0"; ?></span>
                </a>
            </h5>
        </div>
        <div class="six columns">
            <h5>
                <a href="<?php echo site_url('admin/clients/') ?>">
                    <?php echo __('clients:total_clients') ?><br/>
                    <span><?php echo $client_count; ?></span>
                </a>
            </h5>
        </div>
    </div>
</div>