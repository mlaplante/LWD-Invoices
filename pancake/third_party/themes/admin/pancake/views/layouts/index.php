<!DOCTYPE html>
<!--[if lt IE 7]>
<html class="no-js lt-ie9 lt-ie8 lt-ie7" lang="en"> <![endif]-->
<!--[if IE 7]>
<html class="no-js lt-ie9 lt-ie8" lang="en"> <![endif]-->
<!--[if IE 8]>
<html class="no-js lt-ie9" lang="en"> <![endif]-->
<!--[if gt IE 8]><!-->
<html class="no-js" lang="en"> <!--<![endif]-->
    <head>

        <?php $backend_css = function_exists('backend_css') ? backend_css() : Settings::get('backend_css'); ?>
        <?php $backend_js = function_exists('backend_js') ? backend_js() : Settings::get('backend_js'); ?>

        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width"/>
        <title><?php echo $template['title']; ?></title>
        <link rel="stylesheet" href="<?php echo asset::get_src('app.css', 'css'); ?>">

        <!-- Favicon -->
        <link rel="shortcut icon" href="<?php echo asset::get_src('favicon.ico', 'img'); ?>"/>
        <link rel="apple-touch-icon" href="<?php echo asset::get_src('apple-icon.png', 'img'); ?>">
        <link rel="apple-touch-icon" sizes="72x72" href="<?php echo asset::get_src('apple-icon-72.png', 'img'); ?>">
        <link rel="apple-touch-icon" sizes="114x114" href="<?php echo asset::get_src('apple-icon-114.png', 'img'); ?>">
        <link rel="mask-icon" href="<?php echo asset::get_src('mask-icon.svg', 'img'); ?>" color="rgb(232,163,75)">

        <!-- CSS -->

        <?php asset::css('foundation.min.css', array('media' => 'screen'), 'main-css'); ?>
        <?php asset::css('stacked.css', array('media' => 'all'), 'main-css'); ?>
        <?php asset::css('jquery.minicolors.css', array(), 'main-css'); ?>
        <?php asset::css('timePicker.css', array(), 'main-css'); ?>
        <?php asset::css('jquery.meow.css', array(), 'main-css'); ?>
        <?php asset::css('pancake-ui/smoothness-1.10.4/jquery-ui-1.10.4.custom.min.css', array('media' => 'screen'), 'main-css'); ?>
        <?php asset::css('font-awesome.min.css', array('media' => 'screen'), 'main-css'); ?>
        <?php echo asset::render('main-css'); ?>
        <link rel="stylesheet" href="<?php echo Asset::get_src("redactor/redactor.css", 'js'); ?>"/>
        <?php echo (asset::get_src('backend.css', 'css') == "") ? "" : asset::css('backend.css'); ?>
        <?php if (!empty($backend_css)): ?>
            <link rel="stylesheet" href="<?php echo site_url("admin/dashboard/backend_css/" . crc32($backend_css)); ?>"/>
        <?php endif; ?>

        <?php foreach ($plugin_css as $css): ?>
            <link rel="stylesheet" href="<?php echo $css; ?>"/>
        <?php endforeach; ?>

        <script src="<?php echo site_url("admin/dashboard/setup_js/" . crc32(get_setup_js())); ?>"></script>

        <!-- Javascript
    ================================================== -->
        <?php asset::js('jquery-1.11.0.min.js', array(), 'main-js'); ?>

        <?php
        /*
         * If the current environment is "development", then the dev version of jQuery Migrate will be loaded,
         * which will generate console warnings about everything that needs updating.
         */
        ?>
        <?php asset::js('jquery-migrate-1.2.1' . (!IS_DEBUGGING ? '.min' : '') . '.js', array(), 'main-js'); ?>
        <?php asset::js('redactor/redactor.min.js', array(), 'main-js'); ?>
        <?php asset::js('jquery.meow.js', array(), 'main-js'); ?>
        <?php asset::js('jquery-ui-1.10.4.custom.min.js', array(), 'main-js'); ?>
        <?php asset::js('plugins.js', array(), 'main-js'); ?>
        <?php asset::js('jquery.minicolors.js', array(), 'main-js'); ?>
        <?php asset::js('jquery.timePicker.min.js', array(), 'main-js'); ?>
        <?php asset::js('moment.min.js', array(), 'main-js'); ?>

        <?php asset::foundation('javascripts/foundation/jquery.foundation.forms.js', array(), 'foundation-js'); ?>
        <?php asset::foundation('javascripts/foundation/jquery.foundation.reveal.js', array(), 'foundation-js'); ?>
        <?php asset::foundation('javascripts/foundation/jquery.foundation.navigation.js', array(), 'foundation-js'); ?>
        <?php asset::foundation('javascripts/foundation/jquery.foundation.buttons.js', array(), 'foundation-js'); ?>
        <?php asset::foundation('javascripts/foundation/jquery.foundation.tabs.js', array(), 'foundation-js'); ?>
        <?php asset::foundation('javascripts/foundation/jquery.foundation.tooltips.js', array(), 'foundation-js'); ?>
        <?php asset::foundation('javascripts/foundation/jquery.foundation.accordion.js', array(), 'foundation-js'); ?>
        <?php asset::foundation('javascripts/foundation/jquery.placeholder.js', array(), 'foundation-js'); ?>
        <?php asset::foundation('javascripts/foundation/jquery.foundation.alerts.js', array(), 'foundation-js'); ?>
        <?php asset::foundation('javascripts/foundation/jquery.foundation.topbar.js', array(), 'foundation-js'); ?>

        <?php asset::js('jquery.backstretch.min.js', array(), 'secondary-js'); ?>
        <?php asset::js('jquery.wookmark.js', array(), 'secondary-js'); ?>
        <?php asset::js('jquery.knob.js', array(), 'secondary-js'); ?>

        <?php echo asset::render('main-js'); ?>
        <?php echo asset::render('secondary-js'); ?>
        <?php echo asset::render('foundation-js'); ?>
        <?php echo asset::js('main.js'); ?>

        <!-- IE Fix for HTML5 Tags -->
        <!--[if lt IE 9]>
        <script src="//html5shiv.googlecode.com/svn/trunk/html5.js"></script>
        <![endif]-->

        <script>(function(H){H.className=H.className.replace(/\bno-js\b/,'js')})(document.documentElement)</script>
    </head>
    <body id="<?php echo $this->router->fetch_method(); ?>" class="body-wrap <?php echo ($this->router->fetch_class() == "admin" ? "" : $this->router->fetch_class() . "_") . str_ireplace('/', '_', $this->router->fetch_module()); ?> module-<?php echo str_ireplace('/', '-', $this->router->fetch_module()); ?> controller-<?php echo $this->router->fetch_class(); ?> action-<?php echo $this->router->fetch_method(); ?> <?php echo is_admin() ? 'admin' : 'not-admin'; ?> <?php echo (isset($iframe)) ? ($iframe ? 'iframe' : '') : ''; ?> not-login-layout main-layout">

        <!-- Header and Nav -->
        <div class="fixed ">
            <nav class="top-bar">
                <ul>
                    <!-- Title Area -->
                    <?php /* alternate home link:
                      <li id="home-link">
                      <?php echo anchor('admin/','Dashboard'); ?>
                      </li>
                     */ ?>
                    <li id="backend-logo" class="name">
                        <?php echo Business::getLogo(''); ?>
                    </li>

                    <li class="toggle-topbar"><a href="#"></a></li>
                </ul>

                <section>
                    <ul class="left">
                        <li class="divider"></li>
                        <?php $this->load->view("partials/navbar", array("links" => $navbar, "is_base" => true)); ?>
                    </ul>

                    <ul class="right js-settings-dropdown">
                        <li class="has-dropdown">
                            <?php if ($update_counter > 0): ?>
                                <a href="<?php echo site_url('admin/settings#update') ?>" class="tiny button update-badge"><?php echo $update_counter; ?></a><?php endif; ?>
                            <a href="#"><img src="<?php echo get_gravatar($current_user->email, 30) ?>" class="user-pic"/> <?php echo $current_user->first_name ?>
                            </a>
                            <ul class="dropdown">
                                <?php if (is_admin()): ?>
                                    <li>
                                        <a href="<?php echo site_url('admin/plugins') ?>"><?php echo __('global:plugins') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/store') ?>"><?php echo __('store:store'); ?></a>
                                    </li>
                                    <li>
                                        <a target="_blank" href="<?php echo PANCAKEAPP_COM_BASE_URL . "account/support/ticket/new"; ?>"><?php echo __("global:support"); ?></a>
                                    </li>
                                    <?php if ($update_counter > 0): ?>
                                        <li <?php echo ($update_counter > 0) ? 'class="updates-available-badge active"' : '' ?>>
                                            <a href="<?php echo site_url('admin/settings#update') ?>"><?php echo __('global:update' . ($update_counter == 1 ? '' : 's') . '_available', array($update_counter)); ?></a>
                                        </li>
                                    <?php endif; ?>
                                    <li>
                                        <a href="<?php echo site_url('admin/users/logout') ?>"><?php echo __('login:logout'); ?></a>
                                    </li>
                                    <li class="pancake-navigation-label-container">
                                        <label class="pancake-navigation-label"><?php echo __('global:settings'); ?></label>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#general') ?>"><?php echo __('settings:general'); ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#identities') ?>"><?php echo __('settings:business_identities') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#templates') ?>"><?php echo __('settings:emails') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#taxes') ?>"><?php echo __('settings:taxes') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#currencies') ?>"><?php echo __('settings:currencies') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#branding') ?>"><?php echo __('settings:branding') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#payment') ?>"><?php echo __('settings:payment_methods') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#update') ?>"><?php echo __('global:update') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#errors_and_diagnostics') ?>"><?php echo __('settings:errors_and_diagnostics') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#importexport') ?>"><?php echo __('settings:importexport') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#feeds') ?>"><?php echo __('settings:feeds') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#api_keys') ?>"><?php echo __('settings:api_keys') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#task_statuses') ?>"><?php echo __('settings:task_statuses') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings#tickets') ?>"><?php echo __('global:tickets') ?></a>
                                    </li>
                                    <li>
                                        <a href="<?php echo site_url('admin/settings') ?>"><?php echo __("global:all_settings"); ?> &rarr;</a>
                                    </li>
                                <?php else: ?>
                                    <li>
                                        <a href="<?php echo site_url('admin/users/logout') ?>"><?php echo __('login:logout'); ?></a>
                                    </li>
                                <?php endif ?>
                            </ul>
                        </li>
                    </ul>
                </section>
            </nav>
        </div>

        <!-- End Header and Nav -->
        <!-- Main Grid Section -->

        <div id="main">

            <div class="row">
                <?php echo $template['partials']['notifications']; ?>
            </div>

            <?php echo $template['body']; ?>

        </div>
        <!-- /main end -->

        <br class="clear"/>

        <!-- End Grid Section -->

        <!-- Footer -->

        <footer>
            <div class="footer">
                <div class="row">
                    <div class="four columns">
                        <div id="footer-logo" class="name">
                            <?php echo Business::getLogo(''); ?>
                        </div>
                    </div>
                    <div class="eight columns align-right">
                        <div class="pancake-version clearfix">
                            <span class="f-logo"><a href="<?php echo PANCAKEAPP_COM_BASE_URL; ?>">Pancake</a></span>

                            <p>
                                <a target="_blank" href="<?php echo PANCAKEAPP_COM_BASE_URL; ?>blog/entry/pancake-<?php echo Settings::get('version'); ?>-released"><strong style="font-size: 16px;">Pancake</strong>
                                    <br/> <?php echo __('global:version', array(Settings::get('version'))); ?></a></p>
                        </div>
                    </div>
                </div>

                <!-- If you're seeing this, know that you can add .benchmark-details { display:block !important; } to make it show. -->
                <div class="benchmark-details row hideme">
                    <div class="twelve columns">
                        <div style="padding: 4em; text-align: center;">
                            <?php echo uri_string(); ?><br/>
                            Generated in <?php echo elapsed_time(); ?>s (<?php echo elapsed_time() - get_instance()->db->elapsed_time(3); ?>s excluding queries). Executed <?php echo get_instance()->db->total_queries(); ?> queries in <?php echo get_instance()->db->elapsed_time(3); ?>s.<br/>
                            Made <?php echo isset($GLOBALS['HTTP_REQUESTS']) ? $GLOBALS['HTTP_REQUESTS'] : 0; ?> HTTP requests. Peak RAM: <?php echo number_format((memory_get_peak_usage(true) / 1024 / 1024), 2); ?>MB.
                        </div>
                    </div>
                </div>
            </div>
        </footer>
        <!-- /footer end -->

        <?php if (IS_DEMO) : ?>
            <?php echo file_get_contents(FCPATH . 'DEMO'); ?>
        <?php endif; ?>

        <?php if (!isset($iframe) or !$iframe): ?>
            <div id="arbitrary-modal" class="reveal-modal medium">
                <div class="modal-content"></div>
            </div>
            <div id='arbitrary-modal-loading' class="reveal-modal" style='width: 400px; text-align: center;padding: 40px;'>
                <p style="font-size: 2em;"><span class="verb-ing">Loading</span>, please wait...</p>
                <p style="font-size: 1.5em;">This might take a few seconds.</p>
            </div>
        <?php endif; ?>
        <?php echo asset::js('Pancake.js'); ?>
        <?php if (!empty($backend_js)): ?>
            <script src="<?php echo site_url("admin/dashboard/backend_js/" . crc32($backend_js)); ?>"></script>
        <?php endif; ?>
        <?php foreach ($plugin_js as $js): ?>
            <script src="<?php echo $js; ?>"></script>
        <?php endforeach; ?>

        <?php if (Settings::get("is_just_installed")): ?>
            <?php Settings::set("is_just_installed", false); ?>
            <script>
                open_reveal(<?php echo json_encode($this->load->view("dashboard/just_installed", [], true)); ?>);
            </script>
        <?php endif; ?>
    </body>
</html>
