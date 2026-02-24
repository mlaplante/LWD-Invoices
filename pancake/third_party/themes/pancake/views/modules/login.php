<div id="login-box">
    <form id="login-form" method="post" accept-charset="utf-8">
        <fieldset>
            <div class="row">
                <label for="email"><?php echo __('login:username_email') ?>:</label>
                <?php
                echo form_input(array(
                    'name' => 'username',
                    'id' => 'username',
                    'type' => 'text',
                    'class' => 'txt',
                    'value' => set_value('username'),
                    'autocorrect' => "off",
                    'autocapitalize' => "off",
                    'autofocus' => 'autofocus',
                    'spellcheck' => "false",
                ));
                ?>
            </div>

            <div class="row">
                <label for="password"><?php echo lang('login:password') ?>:</label>
                <?php
                echo form_input(array(
                    'name' => 'password',
                    'id' => 'password',
                    'type' => 'password',
                    'class' => 'txt',
                ));
                ?>
            </div>

            <div class="row">
                <label for="remember"><?php echo lang('login:remember') ?>:</label>
                <?php echo form_checkbox('remember', '1', set_checkbox('remember', '1', FALSE), 'id="remember"'); ?>
            </div>

            <?php if (!IS_DEMO) : ?>
                <div class="row">
                    <?php echo anchor('admin/users/forgot_password', lang('login:forgot'), 'id="forgot-password"'); ?>
                </div>
            <?php endif; ?>

            <input type="submit" class="hidden-submit" />
            <button type="submit" class="blue-btn"><span>&nbsp;&nbsp;<?php echo lang('login:login') ?>&nbsp;&nbsp;</span></button>

        </fieldset>
    </form>
</div>
<?php if (IS_DEMO): ?>
    <p>Username: demo</p>
    <p>Password: password</p>
<?php endif; ?>