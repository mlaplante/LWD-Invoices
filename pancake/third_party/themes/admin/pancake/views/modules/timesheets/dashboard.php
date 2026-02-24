<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3"><?php echo __('global:timesheets') ?><br /></h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>
<?php
$has_rounding = (process_hours(Settings::get('task_time_interval')) > 0);

$format_hours = function($amount) {
	if ($amount == 1) {
		$lang = "global:one_hour";
	} else {
		$lang = "global:x_hours";
	}

	return __($lang, [format_hours($amount)]);
};

?>
<div class="row content-wrapper" >
	<div class="twelve columns">
<div class="row">
	<div class="twelve columns">
		
		<div class="row">
			<div class="nine columns">
				<div class="timesheet-actions">
					<ul class="side-bar-btns">
						<li>
							<i class="quicklink-icon fi-calendar"></i>
							<a class="not-has-before toggle-filter-entries" href="#">
								<span><?php echo __("global:change_date_range"); ?></span>
							</a>
						</li>
					</ul>
				</div>
				<h3 class="timesheet-header"><?php echo $dateRange ?> - <?php echo __('tasks:entries'); ?></h3>

				<div class="row">
					<div class="twelve columns panel filter-entries-container" style="display: none;">
						<form action="<?php echo site_url("admin/timesheets/rehash"); ?>" method="POST" style="margin-top: -2em;" name="filter-entries" id="filter-entries">
							<div class="row">
								<div class="<?php echo is_admin() ? "offset-by-five" : "offset-by-seven"; ?> two columns">
									<label>Start date</label>
									<input type="text" name="startDate" class="rounded-input datePicker" value="<?php echo $start; ?>" placeholder="<?php echo format_date(time()) ?>" />
								</div><!-- /three columns -->
								<div class="two columns">
									<label>End date</label>
									<input type="text" name="endDate" class="rounded-input datePicker" value="<?php echo $end; ?>" placeholder="<?php echo format_date(time()) ?>" />
								</div><!-- /three columns -->

								<?php if (is_admin()): ?>
									<div class="two columns">
										<label>Select User</label>
										<?php echo form_dropdown('user_id', $users) ?>
									</div>
								<?php endif ?>

								<div class="one columns" style="padding-top:2em">
									<a class="blue-btn js-fake-submit-button" href="#">
										<span>Filter</span>
									</a>
								</div><!-- /three columns -->

							</div><!-- /row -->

						</form>
					</div><!-- /twelve columns -->
				</div><!-- /row -->


                <p>
        <i class="fa fa-clock-o"></i> <?php echo __("tasks:total_logged_time"); ?>
		<?php if ($has_rounding): ?>
			<i class="fa fa-money"></i> <?php echo __("timesheets:rounded_time", array(format_hours(Settings::get("task_time_interval")))) ?>
		<?php endif; ?>
        </p>
                                
                                
			</div>
			<div class="three columns">
				<h3 class="timesheet-header"><i class="fa fa-dot-circle-o"></i> <?php echo __("global:projects"); ?></h3>
			</div>
		</div>


            <?php if (count($userEntries) == 0): ?>
                <div class="row">
                    <div class="twelve columns">
                        <h5><?php echo __('timesheets:there_are_no_time_entries'); ?></h5>
                    </div>
                </div>
            <?php endif; ?>


		<?php foreach ($userEntries as $user_id => $userEntry): ?>


            <div class="totals" >
                <h4 class="user-totals">

                    <a href="<?php echo site_url("admin/timesheets/filter/$user_id/$original_start/$original_end"); ?>"><?php echo $userEntry['user'] ?></a>
                    <span style="font-size: 0.85em"><i class="fa fa-clock-o" title="<?php echo __("tasks:total_logged_time"); ?>"></i> <?php echo $format_hours($userEntry['totalHours']); ?></span>
                    <?php if ($has_rounding): ?>
                        <span style="font-size: 0.85em"><i class="fa fa-fa-money" title="<?php echo __("timesheets:rounded_time", array(format_hours(Settings::get("task_time_interval")))) ?>"></i> <?php echo $format_hours($userEntry['billableHours']); ?></span>
                    <?php endif; ?>
                </h4>
            </div><!-- /two columns -->
		<div class="row" style="margin-bottom: 2em">
	
			<div class="nine columns timesheet-entries-container">

                <ul class="time-sheet-ledger">

                    <?php foreach ($userEntry['entries'] as $entry): ?>
                        <li>
                            <span class="entry-date time-logged">
                                <i class="fa fa-calendar" title="<?php echo __("timesheets:date"); ?>"></i>
                                <?php $date = format_date($entry->date); ?>
                                <?php $start_time = format_time(strtotime($entry->start_time)); ?>
                                <?php $end_time = format_time(strtotime($entry->end_time)); ?>

                                <?php echo $date; ?> (<?php echo $start_time; ?> - <?php echo $end_time; ?>)
                            </span>
                            <span class="entry-hours time-logged">
                                    <i class="fa fa-clock-o" title="<?php echo __("tasks:total_logged_time"); ?>"></i>
                                <?php echo $format_hours($entry->minutes / 60); ?>
                            </span>
                            <span class="entry-hours time-logged">
                                    <i class="fa fa-star" title="<?php echo __("timesheets:rounded_time", array(format_hours(Settings::get("task_time_interval")))) ?>"></i>
                                <?php echo $format_hours($entry->rounded_minutes / 60); ?>
                            </span>

                            <?php if ($entry->task_id > 0): ?>
                                <a href="<?php echo site_url("admin/projects/view/" . $entry->project_id) ?>">
                                <?php echo $entry->task_name ?>
                                </a>
                            <?php endif; ?>

                            <?php echo ($entry->note) ? '- ' . $entry->note : '' ?>
                        </li>
                    <?php endforeach ?>

                </ul>

			</div><!-- /seven columns -->

			<div class="three columns timesheet-project-totals-container">
				<?php foreach ($userEntry['projectHours'] as $project_id => $project): ?>
				<div class="row">	
					<div class="twelve columns">
                                            <p style=""><a href="<?php echo site_url("admin/projects/view/".$project_id)?>"><?php echo $project['name'] ?></a><br />

						<?php if($project['company'] != ''): ?><i><?php echo $project['company'] ?></i><br /><?php endif ?>
                                                <i class="fa fa-clock-o" title="<?php echo __("tasks:total_logged_time"); ?>"></i> <?php echo $format_hours($project['hours']); ?>
												<?php if ($has_rounding): ?>
                                                &mdash; <i class="fa fa-star" title="<?php echo __("timesheets:rounded_time", array(format_hours(Settings::get("task_time_interval"))))?>"></i> <?php echo $format_hours($project['billableTime']); ?>
												<?php endif; ?>
						</p>
					</div><!-- /ten columns -->
				</div><!-- /row -->
				<?php endforeach ?>
			</div><!-- /three columns -->
		</div><!-- /row -->

		<?php // End of user entry  ?>

		<?php endforeach ?>

		</div><!-- /twelve columns -->
	</div><!-- /row -->

</div><!-- /twelve columns -->




	
	

</div><!-- /row -->