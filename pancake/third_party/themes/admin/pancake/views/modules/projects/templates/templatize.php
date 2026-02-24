<div class="modal-form-holder">

	<div id="form_container">
	  <div id="modal-header">
		 <div class="row">
		   <h3 class="ttl ttl3"><?php echo __('projects:templatize') ?></h3>
		 </div>
	  </div>

	  <div class="form-holder">
		  <p>Would you like to create a project template from this project?</small></p>


		  <form action="<?php echo site_url('/admin/projects/templatize/'.$project->id); ?>" method="post">
			  <p><button type="submit" name="templatize" value="yes" class="blue-btn"><span>Yes, make this a template</span></button></p>
		  </form>
	  </div>
	</div>
</div>