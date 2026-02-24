<div class="modal-form-holder">
    <div id="modal-header">
        <div class="row">
            <h3 class="ttl ttl3"><?php echo __("projects:delete_template"); ?></h3>
        </div>
    </div>

    <div class="row">
        <div id="form_container" class='form-holder'>
            <?php echo form_open('admin/projects/delete_templates/'); ?>
            <span class="sel-item"><?php echo form_dropdown('id', $templates); ?></span>
            <p class="confirm-btn"><button type='submit' class="blue-btn"><span>&nbsp;&nbsp;<?php echo __('global:yesdelete') ?>&nbsp;&nbsp;</span></button></p>
            <?php echo form_close(); ?>
        </div>
    </div>
</div>