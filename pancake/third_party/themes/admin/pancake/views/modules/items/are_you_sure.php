<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo lang('items:delete_title'); ?></h2>
		<?php echo $template['partials']['search']; ?>
    </div>
</div>

<div class="row">
    <div class="nine columns content-wrapper">
        <div class="no_object_notification super-warning">
            
            <?php echo form_open('admin/items/delete/'.$item->id, 'id="delete-item-form"', array('unique_id' => $item->id, 'action_hash' => $action_hash)); ?>

                <p><?php echo __('items:delete_message', (array) $item->name)?> <span class="bad-news"><?php echo __('global:confirm_emphisised')?></span></p>
                <p class="confirm-btn"><a href="#" class="blue-btn js-fake-submit-button"><span>&nbsp;&nbsp;<?php echo lang('global:yesdelete') ?>&nbsp;&nbsp;</span></a></p>

            <?php echo form_close(); ?>
            
        </div><!-- /no_object_notification delete-warning-->
    </div>
</div>