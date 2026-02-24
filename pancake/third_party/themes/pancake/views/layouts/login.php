<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
    <head>

        <?php $frontend_css = function_exists('frontend_css') ? frontend_css() : Settings::get('frontend_css'); ?>
        <?php $frontend_js = function_exists('frontend_js') ? frontend_js() : Settings::get('frontend_js'); ?>

        <title><?php echo __('login:login') ?> | <?php echo Business::getBrandName(); ?></title>

        <!--metatags-->
        <meta name="robots" content="noindex,nofollow"/>
        <meta http-equiv="Content-Type" content="text/html;charset=UTF-8"/>
        <meta http-equiv="Content-Style-Type" content="text/css"/>
        <link rel="mask-icon" href="<?php echo asset::get_src('mask-icon.svg', 'img'); ?>" color="rgb(232,163,75)">

        <!-- CSS -->
        <?php echo asset::css('login.css', array('media' => 'all')); ?>

        <?php if (!empty($frontend_css)): ?>
            <link rel="stylesheet" href="<?php echo site_url("frontend_css/" . crc32($frontend_css) . '.css'); ?>"/>
        <?php endif; ?>

        <?php foreach ($plugin_css as $css): ?>
            <link rel="stylesheet" href="<?php echo $css; ?>"/>
        <?php endforeach; ?>

        <?php echo asset::js('jquery-1.11.0.min.js'); ?>
        <?php
        /*
         * If the current environment is "development", then the dev version of jQuery Migrate will be loaded,
         * which will generate console warnings about everything that needs updating.
         */
        ?>
        <?php echo asset::js('jquery-migrate-1.2.1' . (!IS_DEBUGGING ? '.min' : '') . '.js'); ?>
        <?php if (isset($custom_head)): ?>
            <?php echo $custom_head; ?>
        <?php endif; ?>
    </head>

    <body class="login-layout not-main-layout <?php echo is_admin() ? 'admin' : 'not-admin'; ?>">

        <div id="header-area">
            <?php echo Business::getLogo(); ?>
        </div>

        <div id="wrapper">
            <div id="main" class="form-holder">
                <?php if ($message = $this->session->flashdata('success')): ?>
                    <div class="notification success"><?php echo $message; ?></div>
                <?php endif; ?>
                <?php if (isset($messages['success'])): ?>
                    <div class="notification success"><?php echo $messages['success']; ?></div>
                <?php endif; ?>

                <?php if ($message = $this->session->flashdata('error')): ?>
                    <div class="notification error"><b><?php echo __('global:error'); ?>:</b> <?php echo $message; ?></div>
                <?php endif; ?>
                <?php if (isset($messages['error'])): ?>
                    <div class="notification error"><b><?php echo __('global:error'); ?>:</b> <?php echo $messages['error']; ?></div>
                <?php endif; ?>
                <?php if ($errors = validation_errors('<p>', '</p>')): ?>
                    <div class="notification error"><?php echo $errors; ?></div>
                <?php endif; ?>
                <?php echo $template['body']; ?>
            </div>
            <!-- /main end -->

        </div>
        <!-- /wrapper end -->

        <?php if (IS_DEMO) : ?>
            <?php echo file_get_contents(FCPATH . 'DEMO'); ?>
        <?php endif; ?>

        <?php if (!empty($frontend_js)): ?>
            <script src="<?php echo site_url("frontend_js/" . crc32($frontend_js) . '.js'); ?>"></script>
        <?php endif; ?>
        <?php foreach ($plugin_js as $js): ?>
            <script src="<?php echo $js; ?>"></script>
        <?php endforeach; ?>
    </body>
</html>