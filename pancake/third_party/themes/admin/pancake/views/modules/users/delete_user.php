<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3">Delete User</h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>

<div class="row">
  <div class="nine columns content-wrapper">
    <?php echo form_open('admin/users/delete/' . $user['id'], 'id="delete-invoice-form"'); ?>
    <?php echo form_hidden($csrf); ?>
    <p>Are you sure you want to delete the user '<strong><?php echo $user['username']; ?></strong>'? <span class="bad-news"><?php echo lang('users:confirm_delete_emphasised')?></span></p>
    <p class="confirm-btn"><a href="#" class="blue-btn js-fake-submit-button"><span>&nbsp;&nbsp;Delete User&nbsp;&nbsp;</span></a></p>

    <?php echo form_close(); ?>
</div><!-- /no_object_notification warning-->
</div>