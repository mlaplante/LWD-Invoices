<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo __('global:dashboard'); ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>
<div class="row content-wrapper">
    <div class="six columns">
        <h3 class="dashboard-title"><i class="fa fa-check-square-o "></i> <?php echo __("dashboard:today"); ?></h3>
        <?php if (count($my_upcoming_tasks) > 0): ?>
            <?php $this->load->view("_todays_tasks"); ?>
        <?php else: ?>
            <?php echo __('global:there_are_no_tasks_assigned_to_you'); ?>
        <?php endif; ?>
    </div>
    <div class="three columns">
        <h3 class="dashboard-title"><i class="fa fa-dot-circle-o"></i> <?php echo __("dashboard:your_projects"); ?></h3>
        <?php $this->load->view('_projects') ?>
    </div>
    <div class="three columns">
        <h3 class="dashboard-title"><i class="fa fa-signal"></i> <?php echo __("dashboard:team_activity"); ?></h3>
        <?php $this->load->view('_team_activity'); ?>
    </div>
</div>
<?php if (is_admin()): ?>
    <div class="row">
        <div class="four columns content-wrapper dashboard-content-wrapper">
            <h3 class="dashboard-title"><i
                    class="fa fa-warning"></i> <?php echo __("dashboard:outstanding_invoices"); ?></h3>
            <?php echo $this->load->view('_invoices', array('rows' => $upcoming_invoices)); ?>
        </div>
        <div class="four columns content-wrapper dashboard-content-wrapper">
            <h3 class="dashboard-title"><i class="fa fa-asterisk"></i> <?php echo __('dashboard:client_activity'); ?>
            </h3>
            <?php $this->load->view('_activity'); ?>
        </div>
        <div class="four columns content-wrapper dashboard-content-wrapper">
            <h3 class="dashboard-title"><i class="fa fa-picture-o"></i> <?php echo __('dashboard:snapshot'); ?></h3>
            <?php $this->load->view('_snapshot'); ?>
        </div>
    </div>
<?php endif ?>
