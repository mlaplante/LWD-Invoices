<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo __(human_invoice_type($type) . ':delete_title'); ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>
<div class="row">
    <div class="nine columns content-wrapper">
        <div class="no_object_notification super-warning">
            <?php echo form_open('admin/' . human_invoice_type($type) . '/delete/' . $unique_id, 'id="delete-invoice-form"', array('unique_id' => $unique_id, 'action_hash' => $action_hash)); ?>
            <p><?php echo lang(human_invoice_type($type) . ':delete_message'); ?></p>
            <p class="confirm-btn">
                <a href="#" class="blue-btn js-fake-submit-button">
                    <span><?php echo lang('global:yesdelete') ?></span>
                </a>
            </p>
            <?php echo form_close(); ?>
        </div><!-- /no_object_notification warning-->
    </div><!-- /nine -->
</div><!-- /row -->