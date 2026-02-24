<div class="modal-form-holder">

<div id="form_container">

<div id="modal-header">
	 <div class="row">
	   <h3 class="ttl ttl3"><?php echo lang('times.create.title'); ?></h3>
	 </div>
</div>

		<div class="form-holder">

			<?php echo form_open('admin/projects/times/create/' . $project->id, array('id' => 'add_time')); ?>

				  <div class="row no-bottom">
					  <div class="row no-bottom">
					    <div class="six columns">
						    <label for="start_time"><?php echo lang('times.label.start_time'); ?></label>
						    <?php echo form_input('start_time', set_value('start_time', isset($time) ? $time->start_time : ''), 'id="start_time" class="js-livedisplay-time txt six columns"'); ?>
					      <div class="six columns time"></div>
					    </div>

					    <div class="six columns">
  					    <label for="end_time"><?php echo lang('times.label.end_time'); ?></label>
  					    <?php echo form_input('end_time', set_value('end_time', isset($time) ? $time->end_time : date('H:i')), 'id="end_time" class="js-livedisplay-time txt six columns"'); ?>
  					    <div class="six columns time"></div>
					    </div><!-- /12 -->
						</div><!-- /row -->
					</div><!-- /row -->
					
					<div class="row">
						<div class="row">
							<div class="six columns">
								<label for="date"><?php echo lang('times.label.date'); ?></label>
								<?php echo form_input('date', ($date = set_value('date', isset($time) ? $time->date : time())) ? format_date($date) : '', 'id="date" class="datePicker txt"'); ?>
							</div><!-- /6 -->
						
							<div class="six columns">
								<label for="task_id"><?php echo lang('times.label.task_id'); ?></label>
								<?php $this->load->view('projects/task_select', array(
									'project_id' => $project->id,
									'task_id' => isset($time) ? $time->task_id : 0
								)); ?>                                   
							</div>
						</div>
					</div><!-- /row -->
					
					<div class="row">
						<label for="note"><?php echo lang('times.label.notes'); ?></label>
						<?php echo form_textarea('note', set_value('note'), 'class="txt add-time-note add-bottom"'); ?>
					</div>
					
					<div class="row">
						<input type="hidden" name="project_id" value="<?php echo $project->id; ?>" />
						<a href="#" class="blue-btn js-fake-submit-button"><span><?php echo lang('times.create.title'); ?></span></a>
					</div>
					

         <input type="submit" class="hidden-submit" />
		</div><!-- /form-holder -->
		
		<?php echo form_close(); ?>
			
  </div><!-- /form-container-->
</div><!-- /modal-form-holder -->

<?php echo asset::js('jquery.ajaxform.js'); ?>
<script type="text/javascript">
	$('#add_time').submit(function() {
		var startTime;
		var endTime;

		if ($('#add_time .invalid').length > 0) {
			$('#add_time .invalid').siblings('input').focus();
			return false;
		} else {
			startTime = Time.parse_time($('#start_time').val());
			endTime = Time.parse_time($('#end_time').val());

			if (startTime.isValid()) {
				$('#start_time').val(startTime.format("HH:mm"));
			}

			if (endTime.isValid()) {
				$('#end_time').val(endTime.format("HH:mm"));
			}

			$(this).ajaxSubmit({
			    dataType: 'json',
			    success: function (data) {
				    $('.notification').remove();

				    if (typeof(data.error) != 'undefined')
				    {
					    $('#form_container').before('<div class="notification error">'+data.error+'</div>');
				    }
				    else
				    {
					    $('#form_container').html('<div class="notification success">'+data.success+'</div>');
					    setTimeout("window.location.reload()", 2000);
				    }
			    }
			});
			return false;
	    }
	});

	$(".js-livedisplay-time").trigger("input");
</script>