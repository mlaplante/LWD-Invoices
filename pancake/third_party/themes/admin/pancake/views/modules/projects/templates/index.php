<div class="modal-form-holder">

	<div id="form_container">
	  <div id="modal-header">
		 <div class="row">
		   <h3 class="ttl ttl3"><?php echo __('projects:createfromtemplate'); ?></h3>
		 </div>
	  </div>

	  <div class="form-holder">
		  <form action="<?php echo site_url('/admin/projects/create_from_template'); ?>" method="post">
			  <label>New Project Name</label>
			  <input type="text" name="project_name" />

			  <label>Client</label>
			  <span class="sel-item"><?php echo form_dropdown('client_id', $clients); ?></span>

			  <label>Template</label>
			  <span class="sel-item"><select name="template_id">
				  <option value="0">-- Select a project template --</option>
				  <?php foreach ($templates as $template): ?>
				  	  <option value="<?php echo $template->id; ?>"><?php echo $template->name; ?>
				  <?php endforeach; ?>
			  </select></span>

			  <button type="submit" class="blue-btn"><span>Create</span></button>
		  </form>
		 </div>
	</div>
</div>