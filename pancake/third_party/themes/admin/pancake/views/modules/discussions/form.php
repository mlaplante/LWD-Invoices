<div class="new-comment form-holder">
    <form id="comment-form" method="post" enctype="multipart/form-data" action="<?php echo site_url("admin/discussions/$url"); ?>">
        <h4><?php echo __($title); ?>:</h4>
        <textarea rows="3" class="redactor" name="comment"><?php echo escape($value); ?></textarea>
        <div class="row">
            <div class="eight columns file-holder">
                <label for="file" style="float: left; margin-right: 10px;"><?php echo __('global:attach_file', array(get_max_upload_size())) ?>:</label>
                <?php echo form_upload('files[]'); ?>
            </div>

            <div class="two columns align-right">
                <label>
                    <?php echo __("global:is_private"); ?>
                    <input type="checkbox" name="is_private" <?php if ($last_is_private): ?>checked="checked"<?php endif; ?> />
                </label>
                <p><?php echo __("global:clients_cant_see_private"); ?></p>
            </div>

            <div class="two columns align-right">
                <button type="submit" class="blue-btn"><?php echo __($title); ?></button>
            </div>
        </div>
    </form>
</div>