<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3"><?php echo lang('proposals:delete_message'); ?></h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>

<div class="row">
  <div class="nine columns content-wrapper">
    <div class="no_object_notification super-warning">
      <?php echo form_open('admin/proposals/delete/'.$proposal_id, 'id="delete-client-form"', array('unique_id' => $proposal_id, 'action_hash' => $action_hash)); ?>      
        <p><?php echo lang('proposals:delete_message')?> <span class="bad-news"><?php echo lang('global:confirm_emphisised')?></span></p>
        <p class="confirm-btn">
          <a href="#" class="blue-btn js-fake-submit-button">
            <span><?php echo lang('global:yesdelete')?></span>
          </a>
        </p>
      <?php echo form_close(); ?>
      
    </div><!-- /no_object_notification delete-warning-->
  </div>
</div>