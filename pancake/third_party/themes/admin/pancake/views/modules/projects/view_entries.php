<?php
/*
 * View Time Sheet Entries Page
 * Version 2 (Created: 06th January 2013)
 */
?>

<div id="header" class="js-view-entries-page">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo __('tasks:entries') ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>

<?php /* Add Time */ ?>
<div id="add-time-form" class="row form-holder">
    <h4 class="twelve columns add-bottom"><?php echo __("tasks:add_hours_to", array(anchor('admin/projects/view/' . $project->id, $project->name))); ?></h4>

    <?php echo form_open('admin/projects/times/add_hours/' . $project_id . "/" . $type, array('id' => 'add_time')); ?>

    <?php /* Time */ ?>
    <div class="one columns mobile-two">
        <input type="text" name="hours" class="txt" placeholder="<?php echo __('tasks:hours'); ?>"/>
    </div>

    <?php /* Date */ ?>
    <div class="three columns mobile-two">
        <div class="row">
            <label class="three columns" for="date"><?php echo lang('times.label.date'); ?></label>

            <div class="nine columns sort-time">
                <a id="date-today" href="#" class="date-btn current"><?php echo __("global:today"); ?></a>
                <a id="date-yesterday" href="#" class="date-btn"><?php echo __("global:yesterday"); ?></a>
                <a id="date-other" href="#" class="date-btn"><?php echo __("global:other"); ?></a>
                <input type="hidden" name="day" value="today" id="date-day"/>
            </div>
            <?php
            echo form_input('date', ($date = set_value('date', isset($time) ? $time->date : time())) ? format_date($date) : '', 'id="date" class="datePicker nine columns hide"'); ?>
        </div>
        <!-- /row -->
    </div>
    <!-- /3 -->

    <div class="three columns mobile-two">
        <div class=" row">
            <label class=" five columns"><?php echo __('timesheet:starttime'); ?></label>

            <div class="seven columns">
                <input type="text" name="start_time" class="txt timePicker" placeholder="<?php echo __("global:now"); ?>"/>
            </div>
            <!-- /nine columns -->
        </div>
    </div>
    <!-- /3 -->








    <?php /* Task Select */ ?>
    <div class="three columns mobile-four">
        <div class="row">
            <label class="three columns" for="task_id"><?php echo lang('times.label.task_id'); ?></label>

            <div class="nine columns end">
                <?php $this->load->view('projects/task_select', array(
                    'project_id' => $project_id,
                    'task_id' => isset($time) ? $time->task_id : (isset($task_id) ? $task_id : 0),
                )); ?>
            </div>
            <!-- /5 -->
        </div>
        <!-- /row -->
    </div>
    <!-- /3 -->

    <?php /* Notes */ ?>



    <?php /* Submit */ ?>
    <div class="two columns" style="margin-top: 2px;">
        <input type="hidden" name="project_id" value="<?php echo $project_id; ?>"/>
        <a href="#" class="blue-btn js-fake-submit-button"><span><?php echo lang('times.create.title'); ?></span></a>
        <input type="submit" class="hidden-submit"/>
    </div>


    <div class="twelve columns mobile-four">
        <?php echo form_textarea('note', set_value('note'), 'rows="4" placeholder="' . __('global:notes') . '" class="txt add-time-note"'); ?>
    </div>

    <?php echo form_close(); ?>
</div><!-- /row -->

<?php
$has_rounding = (process_hours(Settings::get('task_time_interval')) > 0);
?>

<?php if (count($entries)): ?>
    <?php /* Start Filters */ ?>
    <div id="sort-entries-fields" class="row">

        <?php

        $task_url = isset($time) ? $time->task_id : (isset($task_id) ? $task_id : 0);
        $task_url = $task_url ? "html/$task_url": "";

        ?>

        <h3><?php echo __('timesheet:entries') ?></h3>
        <a href='<?php echo site_url("timesheet/{$project->unique_id}/{$task_url}"); ?>' class='blue-btn'><?php echo __("timesheet:view_for_clients"); ?></a>
        <br/><br/>

        <div class="twelve columns">
            <!-- <p class="sort-time">
                <strong>Sort by:</strong>
                <a class="sort-box" href="#">Date</a>
                <a class="sort-box" href="#">User</a>
                &nbsp;
                <strong>in order of:</strong>
                <a class="sort-box" href="#">Ascending</a>
                <a class="sort-box" href="#">Decending</a>
            </p> -->

        </div>
        <!-- /12 -->
    </div><!-- /sort-entries-fiels -->



    <?php /* Start Time Sheet */ ?>
    <div class="row">
        <div class="height_transition">
            <div class="view_entries_table">
                <table id="view-entries" class="listtable pc-table table-activity" style="width: 100%;">
                    <?php
                    $total_duration = array();
                    foreach ($entries as $entry) {
                        if (!isset($total_duration[$entry->task_id])) {
                            $total_duration[$entry->task_id] = 0;
                        }
                        $total_duration[$entry->task_id] += $entry->minutes * 60;
                    }

                    $total_rounded_duration = array();
                    foreach ($entries as $entry) {
                        if (!isset($total_rounded_duration[$entry->task_id])) {
                            $total_rounded_duration[$entry->task_id] = 0;
                        }
                        $total_rounded_duration[$entry->task_id] += $entry->rounded_minutes * 60;
                    }

                    reset($total_duration);
                    $first_task = key($total_duration);
                    $total_tasks = count($total_duration);

                    ?>
                    <thead>
                    <th class="cell1"></th>
                        <th colspan="2"><?php echo __('timesheet:user') ?></th>
                    <?php if ($total_tasks > 1): ?>
                        <th class="cell2"><?php echo __('global:task') ?></th>
                    <?php endif; ?>
                    <th class="cell3"><?php echo __('timesheet:date') ?></th>
                        <th class="cell4"><?php echo __('timesheet:duration') ?></th>
                        <?php if ($has_rounding): ?>
                            <th class="cell4">
                                <?php echo __('timesheet:rounded') ?>
                            </th>
                        <?php endif; ?>
                    <th class="cell5"><?php echo __('global:notes') ?></th>
                    <th class="cell5"><?php echo __('global:invoice') ?></th>
                    </thead>
                    <tfoot>
                    <tr>
                        <td colspan='<?php echo ($total_tasks > 1) ? 3 : 4; ?>' rowspan='<?php echo $total_tasks ?>' class='align-right'><?php echo __("tasks:total_logged_time"); ?></td>
                        <?php if ($total_tasks > 1): ?>
                            <td colspan="2" class='align-right'><?php echo isset($tasks_select[$first_task]) ? $tasks_select[$first_task] : __('tasks:no_task'); ?></td>
                        <?php endif; ?>
                        <td><?php echo format_hours($total_duration[$first_task] / 3600) ?></td>
                        <td><?php echo format_hours($total_rounded_duration[$first_task] / 3600) ?></td>
                        <td colspan='2'></td>
                    </tr>
                    <?php unset($total_duration[$first_task]); ?>
                    <?php foreach ($total_duration as $task_id => $total): ?>
                        <tr>
                            <td colspan="2" class='align-right'><?php echo isset($tasks_select[$task_id]) ? $tasks_select[$task_id] : __('tasks:no_task'); ?></td>
                            <td><?php echo format_hours($total / 3600) ?></td>
                            <td><?php echo format_hours($total_rounded_duration[$task_id] / 3600) ?></td>
                            <td colspan='2'></td>
                        </tr>
                    <?php endforeach; ?>
                    </tfoot>
                    <tbody>
                    <?php foreach ($entries as $entry): ?>

                        <tr data-id="<?php echo $entry->id ?>">

                            <td class="cell1 nowrap pic">

                                <a href="#" class="edit-entry js-start-edit-time-entry timesheet-icon edit" data-entry-id="<?php echo $entry->id; ?>" title="Edit">Edit</a>
                                <a href="#" class="delete-entry timesheet-icon delete" title="Delete">Delete</a>

                            </td>

                            <td class="cell-picture">
                                <img src="<?php echo get_gravatar($entry->email, '40'); ?>" class="members-pic"/>
                            </td>

                            <td class="cell2 nowrap">
                                <?php echo $entry->first_name . " " . $entry->last_name; ?>
                            </td>

                            <?php if ($total_tasks > 1): ?>
                                <td><?php echo isset($tasks_select[$entry->task_id]) ? $tasks_select[$entry->task_id] : __('tasks:no_task'); ?></td>
                            <?php endif; ?>

                            <td class="cell3 date nowrap">
                                <span><?php echo format_date($entry->date); ?></span>
                                <?php echo form_input('date', format_date($entry->date), 'id="date-' . $entry->id . '" class="datePicker txt" style="display:none;"') ?>
                            </td>

                            <td class="cell4 duration nowrap">
                                <span class="value"><?php echo format_hours($entry->minutes / 60); ?></span>
                                <small>(
	                         <span class="start_time">
	                         	<strong>From:</strong>
                                        <span><?php echo format_time(strtotime($entry->start_time)); ?></span>
                                 <?php echo form_input('start_time', $entry->start_time, 'style="display:none;"') ?>
	                         </span>

	                         <span class="end_time">
	                         	<strong>To:</strong>
	                        	 <span><?php echo format_time(strtotime($entry->end_time)); ?></span>
                                 <?php echo form_input('end_time', $entry->end_time, 'style="display:none;"') ?>
	                         </span>)
                                </small>
                            </td>
                            <?php if ($has_rounding): ?>
                                <td class="cel4 nowrap">
                                    <span class="js-rounded-duration"><?php echo format_hours($entry->rounded_minutes / 60); ?></span>
                                </td>
                            <?php endif; ?>
                            <td class="cell5 time_note">
                                <?php if ($entry->note): ?>
                                    <small><?php echo auto_typography($entry->note) ?></small>
                                <?php endif ?>
                            </td>

                            <td class="cell6 nowrap time_invoice">
                                <?php if ($entry->invoice_item_id > 0): ?>
                                    <small><?php echo build_invoice_item_id_link($entry->invoice_item_id); ?></small>
                                <?php else: ?>
                                    <small><?php echo __("global:not_billed_yet"); ?></small>
                                <?php endif ?>
                            </td>

                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>

            <div id="form_container" class="form-holder">
                <?php foreach ($entries as $time): ?>
            <div style="display:none;" class="row edit-entry edit-entry-<?php echo $time->id; ?>">
	            	<!-- Pancake Team: Update this here -->
	            	<h5 class="twelve columns">Editing time entry:</h5>

                <?php echo form_open('admin/projects/times/edit/' . $time->id . "/" . $type, array('class' => 'edit_time', 'id' => 'edit_time_' . $time->id)); ?>

                <!-- Start time -->
                <div class="three columns mobile-two">
                		<div class="row">
                				<label class="four columns" for="start_time_<?php echo $time->id; ?>"><?php echo lang('times.label.start_time'); ?></label>
                				<?php echo form_input('start_time', set_value('start_time', isset($time) ? $time->start_time : ''), 'id="start_time_' . $time->id . '" class="txt js-livedisplay-time five columns"'); ?>
                				 <div class="three columns time"></div>
                		</div>
                </div>

                <!-- End Time -->
                <div class="three columns mobile-two">
                		<div class="row">
                				<label class="four columns" for="end_time_<?php echo $time->id; ?>"><?php echo lang('times.label.end_time'); ?></label>
                				<?php echo form_input('end_time', set_value('end_time', isset($time) ? $time->end_time : date('H:i')), 'id="end_time_' . $time->id . '" class="txt js-livedisplay-time five columns"'); ?>
                				<div class="three columns time"></div>
                		</div><!-- /row -->
                </div><!-- /3 -->

                <!-- Date -->
                <div class="three columns mobile-two">
                		<div class="row">
                                    <label class="four columns" for="date_<?php echo $time->id; ?>"><?php echo lang('times.label.date'); ?></label>
                				<?php echo form_input('date', ($date = set_value('date', isset($time) ? $time->date : time())) ? format_date($date) : '', 'id="date_' . $time->id . '" class="datePicker five columns end"'); ?>
                		</div><!-- /row -->
                </div><!-- /3 -->

                <!-- Task Dropdown -->
                <div class="three columns mobile-two">
                		<div class="row">
                				<label class="three columns" for="task_id"><?php echo lang('times.label.task_id'); ?></label>
                				<div class="nine columns end">
                						<?php $this->load->view('projects/task_select', array(
                    'project_id' => $project_id,
                    'task_id' => isset($time) ? $time->task_id : 0,
                )); ?>
                				</div><!-- /5 -->
                		</div><!-- /row -->
                </div><!-- /3 -->

                <!-- Notes -->
                <div class="twelve columns">
                		<label for="note"><?php echo lang('times.label.notes'); ?></label>
                		<?php echo form_textarea('note', set_value('note', $time->note), 'class="txt add-time-note add-bottom"'); ?>
                </div>

                <!-- Submit -->
                <div class="twelve columns">
                	<input type="hidden" name="project_id" value="<?php echo $project_id; ?>" />
                		<a href="#" class="blue-btn js-fake-submit-button"><span><?php echo __('global:save'); ?></span></a>
                		<input type="submit" class="hidden-submit" />
                </div>
           	</div><!-- /none -->
			</form>
        	<?php endforeach; ?>
            </div>
        </div>
    </div>
<?php else: ?>
    <div id="sort-entries-fields" class="row">
        <h3><?php echo __('timesheet:no_entries') ?></h3>
    </div>
<?php endif; ?>
