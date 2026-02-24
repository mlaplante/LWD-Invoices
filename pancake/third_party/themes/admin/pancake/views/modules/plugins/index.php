<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo __('global:plugins'); ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>

<div class="row form-holder">

    <script src="<?php echo Asset::get_src('codemirror/lib/codemirror.js'); ?>"></script>
    <script src="<?php echo Asset::get_src('codemirror/mode/css/css.js'); ?>"></script>
    <?php if (count($plugins) > 0): ?>
        <?php echo form_open_multipart('admin/plugins/save', 'id="plugin-form"'); ?>

        <div id="settings-form" class="nine columns">
            <div class="tabs">
                <div class="three columns">
                    <ul id="settings-tabs" class="twelve columns">
                        <?php foreach ($plugins as $k => $plugin) : ?>
                            <li><a href="#_<?php echo $plugin->alias; ?>"><?php echo $plugin->name; ?></a></li>
                        <?php endforeach; ?>
                    </ul>
                </div><!-- /two -->

                <div id="tab-content" class="nine columns">
                    <?php foreach ($plugins as $k => $plugin) : ?>
                        <div id="_<?php echo $plugin->alias; ?>">
                            <?php echo form_hidden("name[]", $plugin->alias); ?>
                            <h2>
                                <?php echo $plugin->name; ?>
                            </h2>

                            <h3>
                                By <?php echo $plugin->author; ?>
                            </h3>

                            <p>
                                <a href="<?php echo $plugin->url; ?>"><?php echo $plugin->url; ?></a>
                            </p>
                            <?php if (isset($plugin->description) and !empty($plugin->description)): ?>
                                <div style="margin-bottom: 1em;"><?php echo $plugin->description; ?></div><?php endif; ?>
                            <div class="row">
                                <div class="twelve columns">
                                    <input type="checkbox" name="cb[<?php echo $plugin->alias ?>]" <?php echo $plugin->installed == true ? 'checked' : '' ?>/> Enabled
                                </div>
                            </div>
                            <div class="row">
                                <?php foreach ($plugin->fields as $field_name => $field_data): ?>
                                    <div class="twelve columns">
                                        <?php echo $field_data['label']['en']; ?>
                                        <?php
                                        switch ($field_data['type']) {
                                            case 'text': ?>
                                                <input type="text" name="field[<?php echo $plugin->alias; ?>][<?php echo $field_name ?>]" value='<?php echo (strlen($field_data['value']) == 0) ? $field_data['default'] : $field_data['value']; ?>'/>
                                                <?php break;
                                            case 'textarea': ?>
                                                <textarea name="field[<?php echo $plugin->alias; ?>][<?php echo $field_name ?>]"><?php echo empty($field_data['value']) ? $field_data['default'] : $field_data['value']; ?></textarea>
                                                <?php break;
                                            case 'select': ?>
                                                <div class="sel-item">
                                                    <select name="field[<?php echo $plugin->alias; ?>][<?php echo $field_name ?>]">
                                                        <?php $options = is_callable($field_data['options']) ? call_user_func($field_data['options']) : $field_data['options']; ?>
                                                        <?php $default = isset($field_data['default']) ? $field_data['default'] : ""; ?>
                                                        <?php $select_value = ($field_data['value'] === false) ? $default : $field_data['value']; ?>
                                                        <?php foreach ($options as $value => $label): ?>
                                                            <option value="<?php echo $value; ?>" <?php echo ($select_value == $value) ? 'selected="selected"' : ''; ?>><?php echo $label; ?></option>
                                                        <?php endforeach; ?>
                                                    </select>
                                                </div>
                                                <?php break;
                                            case 'radio':
                                                break;
                                            case 'radio':
                                                break;
                                            default:

                                                break;
                                        }
                                        ?>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div><!-- /tabbed-content-->

                <input type="submit" class="hidden-submit"/>
            </div><!-- /tabs-row-->
        </div><!-- /row-->

        <div class="three columns side-bar-wrapper" style="margin-top:0px;">
            <div class="panel">
                <h4 class="sidebar-title">Save Plugin Settings</h4>

                <p>Save your updated settings before changing tab or leaving the page</p>

                <p>
                    <button class="blue-btn">Save Plugin Settings</button>
                </p>
            </div>
        </div>

        <?php echo form_close(); ?>
    <?php else: ?>

        <h1 style='text-align: center; margin-top: 2em;'>You have no installed plugins.</h1>
        <p style='text-align:center;'>To get plugins, go to
            <a href='<?php echo site_url('admin/store') ?>'>the Pancake Store</a>.</p>

    <?php endif; ?>
    <?php echo asset::js('jquery.history.js'); ?>
    <script type="text/javascript">
        $(document).ready(function () {

            $('#frontend_css, #backend_css').each(function () {
                CodeMirror.fromTextArea(this);
            });

            $('.form_error').parent().find('input').addClass('error');

            $('.tabs').tabs({
                select: function (event, ui) {
                    jQuery.history.load($(ui.panel).attr('id'));
                }
            });
        });
    </script>
</div><!--/ten columns-->