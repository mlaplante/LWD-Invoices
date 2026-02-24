<div id="login-box">
    <?php echo form_open("admin/users/forgot_password", 'id="forgot-password-form"'); ?>
    <fieldset>
        <p><?php echo lang('login:forgotinstructions') ?></p>

        <div class="row">
            <label for="email"><?php echo lang('login:email') ?>:</label>
            <?php
            echo form_input(array(
                'name' => 'email',
                'id' => 'email',
                'type' => 'text',
                'class' => 'txt',
                'value' => set_value('email'),
            ));
            ?>
        </div>

        <div class="row submit-button-holder">
            <button type="submit" class="blue-btn"><?php echo lang('login:reset') ?></button>
        </div>

        <div id="cancel">
            <?php echo anchor('admin/', lang('login:cancel'), 'id="cancel"'); ?>
        </div>
<?php echo form_close(); ?>