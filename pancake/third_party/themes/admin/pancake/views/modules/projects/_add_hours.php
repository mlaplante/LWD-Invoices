<div id="form_container" class="add_hours_container">
    <div id="modal-header">
	    <div class="row">
	        <h3 class="ttl ttl3">Add Hours</h3>
	    </div>
    </div>
    
	<?php echo form_open('admin/projects/times/add_hours/' . $project->id, array('id' => 'add_time')); ?>

    <div class="form-holder" data-project-id="<?php echo $project->id; ?>">
        <div class="row hours">
            <label><?php echo __('projects:hours_worked'); ?></label>
            <input type="text" name="hours" class="txt" />
        </div>
        <div class="row">
        	<div class="row">
	        	<div class="six columns date">
		            <label><?php echo lang('timesheet:date'); ?></label>
		            <?php echo form_input('date', ($date = set_value('date', isset($time) ? $time->date : time())) ? format_date($date) : '', 'id="date" class="datePicker txt"'); ?>            
		            <?php //echo form_input('add_hours_date', format_date(time()), 'class="datePicker txt hasDatepicker"'); ?>
	        	</div><!-- /6 -->
	        	
		        <div class="six columns task">
		            <label><?php echo __('global:task'); ?></label>
		            <?php
		            $this->load->view('projects/task_select', array(
		                'project_id' => $project->id,
		                'task_id' => 0,
		            ));
		            ?>
		        </div><!-- /6 -->
        	</div>
        </div><!-- /row -->

        <div class="row notes add-bottom">
            <label><?php echo __('global:notes'); ?></label>
            <?php echo form_textarea('note', '', 'class="txt add-time-note"'); ?>
        </div>
		
        <div class="row"><a href="#" class="submit_hours blue-btn js-fake-submit-button"><span>Save hours</span></a></div>
    </div>
	</form>
</div>

<script>

function save_hours() {
    var add_hours = $('.add_hours_container');
    var hours = add_hours.find('[name=hours]').val();
    var date = $('.hasDatepicker').datepicker('getDate').getTime() / 1000;
    var task = add_hours.find('[name=task_id]').val();
    var notes = add_hours.find('[name=note]').val();
    $.post(submit_hours_url, {
        hours: hours,
        date: date,
        task: task,
        notes: notes,
        project_id: project_id
    }, function(response) {
        window.location.reload();
    });
    $.facebox.close();
}
</script>
