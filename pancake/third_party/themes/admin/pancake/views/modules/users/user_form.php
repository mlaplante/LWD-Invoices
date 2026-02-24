<div class="modal-form-holder">
    <div id="modal-header">
        <div class="row">
            <h3 class="ttl ttl3"><?php echo __('users:' . $action . '_user'); ?></h3>
        </div>
    </div>
    <p><?php echo __("users:please_enter_information"); ?></p>
    <?php
    $validation = validation_errors();
    if (!empty($validation)) {
        echo '<div class="error" style="padding: 1em;margin-bottom: 2em;">';
        echo $validation;
        echo '</div>';
    }

    $errors = isset($errors) ? $errors : '';
    if (!empty($errors)) {
        echo '<div class="error" style="padding: 1em;margin-bottom: 2em;">';
        echo $errors;
        echo '</div>';
    }
    ?>
    <?php echo form_open("admin/users/" . ($action == "create" ? $action : "$action/{$member->id}"), 'id="user-form"'); ?>
    <div class="row">
        <div class="row user-form form-holder">
            <div class="four columns">
                <!-- @todo needs to update dynamically based on email provided in email field -->
                <img class="user-gravatar" src="<?php echo($action == "create" ? "//www.gravatar.com/avatar/31cdba71cc02563767db3ed44deec276?s=130&d=mm&r=g" : get_gravatar($member->email, '130')); ?>"/>
            </div>

            <div class="eight columns">
                <div class="row add-bottom">
                    <div class="six columns">
                        <label for="first_name"><?php echo __('global:first_name') ?>:</label>
                        <?php echo form_input(array(
                            'name' => 'first_name',
                            'id' => 'first_name',
                            'type' => 'text',
                            'value' => isset($member->first_name) ? $member->first_name : set_value('first_name'),
                            'placeholder' => __('global:first_name'),
                            'class' => 'txt',
                        )); ?>
                    </div>
                    <!-- /6-->

                    <div class="six columns end">
                        <label for="last_name"><?php echo __('global:last_name') ?>:</label>
                        <?php echo form_input(array(
                            'name' => 'last_name',
                            'id' => 'last_name',
                            'type' => 'text',
                            'class' => 'txt',
                            'placeholder' => __('global:last_name'),
                            'value' => isset($member->last_name) ? $member->last_name : set_value('last_name'),
                        )); ?>
                    </div>
                    <!-- /6-->
                </div>
                <!-- /row -->

                <div class="row add-bottom">
                    <div class="six columns">
                        <label for="email"><?php echo __("global:email"); ?>:</label>
                        <?php echo form_input(array(
                            'name' => 'email',
                            'id' => 'email',
                            'type' => 'text',
                            'class' => 'txt',
                            'placeholder' => __("global:email"),
                            'value' => isset($member->email) ? $member->email : set_value('email'),
                        )); ?>
                    </div>
                    <!-- /12 -->

                    <div class="six columns end">
                        <span class="sel-item"><?php echo form_dropdown(($action == 'create' ? 'group' : 'group_id'), $groups, set_value('group', isset($member->group_id) ? $member->group_id : "")); ?></span>
                    </div>
                    <!-- /8 -->
                </div>
                <!-- /row -->

                <div class="row add-bottom">
                    <div class="six columns">
                        <label for="company"><?php echo __("global:company"); ?>:</label>
                        <?php echo form_input(array(
                            'name' => 'company',
                            'id' => 'company',
                            'type' => 'text',
                            'class' => 'txt',
                            'placeholder' => __('global:company'),
                            'value' => isset($member->company) ? $member->company : set_value('company'),
                        )); ?>
                    </div>

                    <div class="six columns end">
                        <label for="phone1"><?php echo __("global:phone"); ?>:</label>
                        <?php echo form_input(array(
                            'name' => 'phone',
                            'id' => 'phone',
                            'type' => 'text',
                            'class' => 'txt',
                            'placeholder' => __('global:phone'),
                            'value' => isset($member->phone) ? $member->phone : set_value('phone'),
                        )); ?>
                    </div>
                </div>
                <!-- /row -->

            </div>
            <!-- /eight -->

            <br class="clear"/>

            <div class="twelve columns add-bottom">
                <div class="row add-bottom">
                    <div class="four columns">
                        <label for="username"><?php echo __('login:username'); ?>:</label>
                        <?php echo form_input(array(
                            'name' => 'username',
                            'id' => 'username',
                            'type' => 'text',
                            'class' => 'txt',
                            'placeholder' => __('login:username'),
                            'value' => isset($member->username) ? $member->username : set_value('username'),
                        )); ?>
                    </div>
                    <!-- /6-->

                    <div class="four columns">
                        <label for="password"><?php echo __('login:password'); ?>:</label>
                        <?php echo form_password(array(
                            'name' => 'password',
                            'id' => 'password',
                            'type' => 'password',
                            'class' => 'txt',
                            'placeholder' => __('login:password'),
                            'value' => set_value('password'),
                        ), ''); ?>
                    </div>

                    <div class="four columns end">
                        <label for="password_confirm"><?php echo __("users:confirm_password"); ?>:</label>
                        <?php echo form_password(array(
                            'name' => 'password_confirm',
                            'id' => 'password_confirm',
                            'type' => 'password',
                            'class' => 'txt',
                            'placeholder' => __("users:confirm_password"),
                            'value' => set_value('password_confirm'),
                        ), ''); ?>
                    </div>
                </div>
                <!-- /row -->
            </div>
            <!-- /12 -->

            <div class="twelve columns no-bottom">
                <a href="#" class="blue-btn js-fake-submit-button"><span><?php echo __('global:save') ?></span></a>
                <input type="submit" class="hidden-submit"/>
            </div>
            <!-- /12 -->
        </div>
        <!-- /row -->

        <?php echo form_close(); ?>
    </div>
</div><!-- /modal-form-holder -->