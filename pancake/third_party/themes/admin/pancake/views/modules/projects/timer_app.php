<!DOCTYPE html>
<html>
    <head>
        <title><?php echo __("global:timer_app"); ?></title>
        <meta charset="utf-8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link href="<?php echo site_url('third_party/default_logo.png'); ?>" rel="apple-touch-startup-image" />
        <link rel="apple-touch-icon" href="<?php echo site_url('third_party/default_logo.png'); ?>" />
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
        <link href="//fonts.googleapis.com/css?family=Lato:400,900" rel="stylesheet" />
        <link href="//netdna.bootstrapcdn.com/font-awesome/4.0.3/css/font-awesome.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="<?php echo Asset::get_src('timer_app.css', 'css'); ?>" />
    </head>
    <body>

        <div class="timer-container">
            <div class="header">
                <i class="fa fa-clock-o"></i> <h1>
                    <span class="client-name">
                        <?php echo ucwords(__("global:client")); ?>: <select id='client'>
                        <?php foreach (client_dropdown('projects', 'read') as $key => $value): ?>
                                <option value='<?php echo $key; ?>'><?php echo $value; ?></option>
                            <?php endforeach; ?>
                        </select>
                    </span>

                    <span class="project-name">
                        <?php echo ucwords(__("projects:project")); ?>: <select id='project'>
                            <option value=""><?php echo __('global:select'); ?></option>
                        </select>
                    </span>

                    <span class="task-name">
                        <?php echo ucwords(__('tasks:task')); ?>: <select id='task'>
                            <option value=""><?php echo __('global:select'); ?></option>
                        </select>
                    </span>
                </h1>
            </div>
            <div class='body'>
                <section class="timer">
                    <div class="timer-h">00</div>
                    <div class="divider">:</div>
                    <div class="timer-m">00</div>
                    <div class="divider">:</div>
                    <div class="timer-s">00</div>
                </section>

                <section class="action stop">
                    <a href="#"><i class="fa fa-stop"></i></a>
                </section>

                <section class="action play">
                    <a href="#"><i class="fa fa-play"></i></a>
                </section>
            </div>
        </div>

        <script>

            // We use the _order variables to preserve the order of the keys in the JSON object, for looping.
            projects_per_client = <?php echo json_encode($projects_per_client) ?>;
            projects_per_client_order = <?php echo json_encode($projects_per_client_order); ?>;
            tasks_per_project = <?php echo json_encode($tasks_per_project) ?>;
            tasks_per_project_order = <?php echo json_encode($tasks_per_project_order); ?>;
            timers = <?php echo json_encode($timers); ?>;
            baseURL = '<?php echo BASE_URL; ?>';
            current_timer = <?php echo isset($current_timer) ? json_encode($current_timer) : 'false'; ?>;

        </script>

        <script type="text/plain" id="default-option-template">
            <option value=""><?php echo __('global:select'); ?></option>
        </script>
        <?php echo asset::js('jquery-1.11.0.min.js'); ?>
        <script src="<?php echo Asset::get_src('timer_app.js', 'js'); ?>"></script>
    </body>
</html>