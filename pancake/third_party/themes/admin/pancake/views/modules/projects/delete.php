<div class="modal-form-holder">

<div id="modal-header">
     <div class="row">
       <h3 class="ttl ttl3"><?php echo lang('projects.delete.title'); ?></h3>
     </div>
</div>

<div class="row">
	<div id="form_container">
		<?php echo form_open('admin/projects/delete/', array('id' => 'create_form')); ?>
			<input type="hidden" name="id" value="<?php echo $project->id; ?>" />
			
			<p class="confirm-btn"><a href="#" class="blue-btn js-fake-submit-button"><span>&nbsp;&nbsp;<?php echo __('global:yesdelete') ?>&nbsp;&nbsp;</span></a></p>
		
		<?php echo form_close(); ?>
	</div>
</div>
</div><!-- /modal-form-holder -->


<?php echo asset::js('jquery.ajaxform.js'); ?>

<script type="text/javascript">

	$('#create_form').ajaxForm({
		dataType: 'json',
		success: showResponse
	});

	function showResponse(data) {
		$('.notification').remove();

		if (typeof(data.error) != 'undefined') {
			$('#form_container').before('<div class="notification error">' + data.error + '</div>');
		} else {
			window.location.href = site_url('admin/projects');
		}
	}
</script>