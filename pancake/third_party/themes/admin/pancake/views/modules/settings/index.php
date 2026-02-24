<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo __('global:settings'); ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>

<div class="row form-holder content-wrapper">

    <script src="<?php echo Asset::get_src('codemirror-compressed.js'); ?>"></script>

    <?php echo form_open_multipart('admin/settings', 'id="settings-form"'); ?>

    <div id="settings-form" class="twelve columns">
        <div class="sidebar-tabs">
            <div class="three columns">
                <a href="#" class="blue-btn settings-save-button js-fake-submit-button"><span><?php echo __('settings:save') ?></span></a>
                <ul id="settings-tabs" class="twelve columns">
                    <li><a href="#general"><?php echo __('settings:general') ?></a></li>
                    <li><a href="#identities"><?php echo __("settings:business_identities") ?></a></li>
                    <li><a href="#templates"><?php echo __('settings:emails') ?></a></li>
                    <li><a href="#taxes"><?php echo __('settings:taxes') ?></a></li>
                    <li><a href="#currencies"><?php echo __('settings:currencies') ?></a></li>
                    <li><a href="#branding"><?php echo __('settings:branding') ?></a></li>
                    <li><a href="#payment"><?php echo __('settings:payment_methods') ?></a></li>
                    <li><a href="#update"><?php echo __('global:update') ?></a></li>
                    <li><a href="#errors_and_diagnostics"><?php echo __('settings:errors_and_diagnostics') ?></a></li>
                    <li><a href="#importexport"><?php echo __('settings:importexport') ?></a></li>
                    <li><a href="#feeds"><?php echo __('settings:feeds') ?></a></li>
                    <li><a href="#api_keys"><?php echo __('settings:api_keys') ?></a></li>
                    <li><a href="#task_statuses"><?php echo __('settings:task_statuses') ?></a></li>
                    <li><a href="#tickets"><?php echo __('global:tickets') ?></a></li>
                </ul>
            </div><!-- /two -->

            <div id="tab-content" class="nine columns">
                <div id="general">
                    <div class="row">
                        <div class="six columns">
                            <label for="language"><?php echo __('settings:language') ?></label>
                            <?php if (IS_DEMO): ?>
                                <p class="settings-explain">You cannot change Pancake's language in the demo.</p>
                            <?php endif; ?>
                            <span class="sel-item"><?php echo form_dropdown('language', $languages, Settings::get('language'), 'id="language"'); ?></span>
                        </div><!-- /8 -->

                        <div class="six columns">
                            <label for="pdf_page_size"><?php echo __('settings:pdf_page_size') ?></label>
	  	                <span class="sel-item">
		  	                <select id="pdf_page_size" name="pdf_page_size">
                                <option value="A4" <?php echo (isset($settings['pdf_page_size']) and $settings['pdf_page_size'] == 'A4') ? 'selected="selected"' : ''; ?>>A4</option>
                                <option value="LETTER" <?php echo (isset($settings['pdf_page_size']) and $settings['pdf_page_size'] == 'LETTER') == $settings['admin_theme'] ? 'selected="selected"' : ''; ?>>Letter</option>
                            </select>
			  	        </span>
                        </div>
                    </div><!-- /row -->

                    <div class='row'>
                        <?php if (!IS_HOSTED): ?>
                            <div class="four columns">
                                <label for="license_key"><?php echo __('global:license_key') ?>
                                    <span style="font-size:80%">(<?php echo __('global:version', array(Settings::get('version'))) ?>)</span></label>
                                <input type="text" name="license_key" value="<?php echo $settings['license_key']; ?>" class="txt"/>
                            </div>
                        <?php endif; ?>
                        <div class="eight columns">
                            <label for="timezone"><?php echo __('settings:timezone') ?></label>
                            <span class="sel-item"><?php echo form_dropdown('timezone', $this->settings_m->get_timezones(), Settings::get('timezone'), 'id="timezone"'); ?></span>
                        </div>
                    </div>

                    <div class="row">

                        <div class="twelve columns">
                            <label for="allowed_extensions"><?php echo __('settings:allowed_extensions') ?>
                                <span style="font-size:80%">(<?php echo __('settings:comma_separated') ?>)</span></label>
                            <input type="text" name="allowed_extensions" value="<?php echo $settings['allowed_extensions']; ?>" class="txt"/>
                        </div><!-- /8 -->
                    </div><!-- /row -->

                    <div class="row">
                        <div class="six columns">
                            <label for="date_format"><?php echo __('settings:date_format') ?></label>
                            <input type="text" name="date_format" value="<?php echo $settings['date_format']; ?>" class="txt"/>
                        </div>

                        <div class="six columns">
                            <label for="time_format"><?php echo __('settings:time_format') ?></label>

                            <div class="sel-item">
                                <select id="time_format" name="time_format">
                                    <option value="h:i A" <?php echo($settings['time_format'] == html('h:i A') ? 'selected="selected"' : '') ?>>12-hour clock (e.g. <?php echo date('h:i A'); ?>)</option>
                                    <option value="H:i" <?php echo($settings['time_format'] == html('H:i') ? 'selected="selected"' : '') ?>>24-hour clock (e.g. <?php echo date('H:i'); ?>)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="task_time_interval"><?php echo __('settings:task_time_interval') ?></label>

                            <p class="settings-explain"><?php echo __('settings:task_time_interval_description'); ?></p>
                            <input type="text" name="task_time_interval" value="<?php echo $settings['task_time_interval']; ?>" class="txt" size="3"/>
                        </div>
                    </div>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="default_task_due_date"><?php echo __('settings:default_task_due_date') ?></label>

                            <p>
                                <input type="text" name="default_task_due_date" id="default_task_due_date" value="<?php echo $settings['default_task_due_date']; ?>" class="txt no-bottom"/>
                                <small><?php echo __('settings:default_task_due_date_explain'); ?></small>
                            </p>
                        </div>
                    </div>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="year_start_day"><?php echo __('settings:year_start') ?></label>

                            <div class="three columns">
                                <div class="sel-item">
                                    <select id="year_start_day" name="year_start_day">
                                        <?php for ($i = 1; $i <= 31; $i++): ?>
                                            <option value="<?php echo $i; ?>" <?php echo $settings['year_start_day'] == $i ? 'selected="selected"' : ''; ?>><?php echo $i; ?></option>
                                        <?php endfor; ?>
                                    </select>
                                </div>
                            </div>
                            <div class="nine columns">
                                <div class="sel-item">
                                    <select id="year_start_month" name="year_start_month">
                                        <?php for ($i = 1; $i <= 12; $i++): ?>
                                            <option value="<?php echo $i; ?>" <?php echo $settings['year_start_month'] == $i ? 'selected="selected"' : ''; ?>><?php echo date("F", mktime(0, null, null, $i)); ?></option>
                                        <?php endfor; ?>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="items_per_page"><?php echo __('settings:items_per_page') ?></label>

                            <p class="settings-explain"><?php echo __('settings:items_per_page_explain'); ?></p>
                            <input type="text" name="items_per_page" id="items_per_page_input" value="<?php echo $settings['items_per_page']; ?>" class="txt no-bottom"/>
                        </div>
                    </div>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="default_invoice_due_date"><?php echo __('settings:default_invoice_due_date') ?></label>

                            <p>
                                <input type="text" name="default_invoice_due_date" id="default_invoice_due_date" value="<?php echo $settings['default_invoice_due_date']; ?>" class="txt no-bottom"/>
                                <small><?php echo __('settings:default_invoice_due_date_explain'); ?></small>
                            </p>
                        </div>
                    </div>

                    <div class="row">
                        <label class="four columns" for="always_autosend"><?php echo __('settings:always_autosend') ?></label>

                        <div class="eight columns">
                            <input id="always_autosend" type="checkbox" name="always_autosend" <?php echo $settings['always_autosend'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                        </div>
                    </div>

                    <div class="row settings-row-with-padding">
                        <label class="four columns" for="send_x_days_before"><?php echo __('settings:send_x_days_before') ?></label>

                        <div class="eight columns">
                            <input type="text" name="send_x_days_before" id="send_x_days_before_input" value="<?php echo $settings['send_x_days_before']; ?>" class="no-bottom txt"/>
                            <small><?php echo __('settings:send_x_days_before_explain'); ?></small>
                        </div>
                    </div>

                    <div class="row">
                        <label class="four columns"><?php echo __('settings:autosave_proposals') ?></label>

                        <div class="eight columns">
                            <input id="autosave_proposals" type="checkbox" name="autosave_proposals" <?php echo $settings['autosave_proposals'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                        </div><!-- /4 -->
                    </div><!-- /row -->

                    <div class="row">
                        <label class="four columns"><?php echo __('settings:time_entry_times'); ?></label>

                        <div class="eight columns">
                            <input id="include_time_entry_dates" type="checkbox" name="include_time_entry_dates" <?php echo $settings['include_time_entry_dates'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                            <small><?php echo __("settings:include_dates_and_times_in_line_items"); ?></small>
                        </div>
                    </div>
                    <div class="row">
                        <label class="eight columns"><?php echo __("settings:when_generating_invoice"); ?></label>

                        <div class="four columns">
                            <div class="sel-item">
                                <select id="split_line_items_by" name="split_line_items_by">
                                    <option value="project_tasks" <?php echo($settings['split_line_items_by'] == 'project_tasks' ? 'selected="selected"' : '') ?>><?php echo __('global:task'); ?></option>
                                    <option value="project_milestones" <?php echo($settings['split_line_items_by'] == 'project_milestones' ? 'selected="selected"' : '') ?>><?php echo __('milestones:milestone'); ?></option>
                                    <option value="project_times" <?php echo($settings['split_line_items_by'] == 'project_times' ? 'selected="selected"' : '') ?>><?php echo __('items:select_time_entry'); ?></option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="row">
                        <label class="four columns"><?php echo __("settings:use_utf8_font"); ?></label>

                        <div class="eight columns">
                            <input id="use_utf8_font" type="checkbox" name="use_utf8_font" <?php echo $settings['use_utf8_font'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                            <small><?php echo __("settings:use_utf8_font_explanation"); ?></small>
                        </div>
                    </div>

                    <div class="row">
                        <label class="four columns"><?php echo __('settings:always_https') ?></label>

                        <div class="eight columns">
                            <input id="always_https" type="checkbox" name="always_https" <?php echo $settings['always_https'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                            <small class="always_https_explanation"><?php echo __('settings:always_https_explanation'); ?></small>
                        </div>
                    </div>

                    <div class="row">
                        <div class="twelve columns">
                            <hr>
                            <label for="filesystem"><?php echo __('settings:filesystem') ?></label>
                            <p><?php echo __("settings:filesystem_explain"); ?></p>
                            <select name="filesystem[adapters][]" multiple="multiple" class="multiselect" data-nothing-selected-label="<?php echo __("settings:filesystem_local"); ?>">
                                <?php $adapters = \Pancake\Filesystem\Filesystem::getEnabledAdapters(); ?>
                                <?php foreach (\Pancake\Filesystem\Filesystem::getAdapters() as $adapter => $label): ?>
                                    <option value="<?php echo $adapter; ?>" <?php echo (in_array($adapter, $adapters)) ? 'selected="selected"' : ''; ?>><?php echo $label; ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>

                    <div class="row filesystem-settings js-filesystem js-filesystem-s3">
                        <div class="six columns">
                            <label for="filesystem_s3_access_key"><?php echo __("filesystem:s3_access_key"); ?></label>
                            <input id="filesystem_s3_access_key" type="text" name="filesystem[s3][access_key]" value="<?php echo \Pancake\Filesystem\Filesystem::getSetting("s3", "access_key"); ?>" class="txt"/>
                        </div>
                        <div class="six columns">
                            <label for="filesystem_s3_secret_key"><?php echo __("filesystem:s3_secret_key"); ?></label>
                            <input id="filesystem_s3_secret_key" type="text" name="filesystem[s3][secret_key]" value="<?php echo \Pancake\Filesystem\Filesystem::getSetting("s3", "secret_key"); ?>" class="txt"/>
                        </div>
                        <div class="six columns">
                            <label for="filesystem_s3_bucket"><?php echo __("filesystem:s3_bucket"); ?></label>
                            <input id="filesystem_s3_bucket" type="text" name="filesystem[s3][bucket]" value="<?php echo \Pancake\Filesystem\Filesystem::getSetting("s3", "bucket"); ?>" class="txt"/>
                        </div>
                        <div class="six columns">
                            <label for="filesystem_s3_prefix"><?php echo __("filesystem:s3_prefix"); ?></label>
                            <input id="filesystem_s3_prefix" type="text" name="filesystem[s3][prefix]" value="<?php echo \Pancake\Filesystem\Filesystem::getSetting("s3", "prefix"); ?>" class="txt"/>
                        </div>
                    </div>

                    <div class="row filesystem-settings js-filesystem js-filesystem-ftp">
                        <div class="six columns">
                            <label><?php echo __('settings:ftp_user') ?></label>
                            <input type="text" name="filesystem[ftp][user]" value="<?php echo \Pancake\Filesystem\Filesystem::getSetting("ftp", "user"); ?>" class="txt"/>
                        </div>

                        <div class="six columns">
                            <label><?php echo __('settings:ftp_pass') ?></label>
                            <input type="password" name="filesystem[ftp][pass]" value="<?php echo \Pancake\Filesystem\Filesystem::getSetting("ftp", "pass"); ?>" class="txt"/>
                        </div>

                        <div class="six columns">
                            <label><?php echo __('settings:ftp_host') ?></label>
                            <input type="text" name="filesystem[ftp][host]" value="<?php echo \Pancake\Filesystem\Filesystem::getSetting("ftp", "host"); ?>" class="txt"/>
                        </div>

                        <div class="six columns">
                            <label><?php echo __('settings:ftp_path') ?></label>
                            <input type="text" name="filesystem[ftp][path]" value="<?php echo \Pancake\Filesystem\Filesystem::getSetting("ftp", "path"); ?>" class="txt"/>
                        </div>

                        <div class="six columns">
                            <label><?php echo __('settings:ftp_port') ?></label>
                            <input type="text" name="filesystem[ftp][port]" value="<?php echo \Pancake\Filesystem\Filesystem::getSetting("ftp", "port"); ?>" class="txt"/>
                        </div>

                        <div class="six columns">
                            <label><?php echo __('settings:ftp_pasv') ?></label>
                            <input type="checkbox" name="filesystem[ftp][pasv]" <?php echo \Pancake\Filesystem\Filesystem::getSetting("ftp", "pasv") == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                        </div>
                    </div>

                </div><!--/general-->

                <div id="identities">
                    <dl class="tabs <?php echo count($businesses) > 1 ? 'has-multiple-identities' : ''; ?>">
                        <?php $i = 1; ?>
                        <?php foreach ($businesses as $business_id => $business): ?>
                            <dd class="<?php echo $i === 1 ? 'active' : ''; ?>">
                                <a class="js-tab-link" href="<?php echo "#identities_business_{$business_id}"; ?>"><?php echo $business['brand_name']; ?></a>
                                <a href="#" type="button" class="js-remove-business"><i class="fa fa-times"></i></a>
                            </dd>
                            <?php $i++; ?>
                        <?php endforeach; ?>

                        <dd class="js-add-business-dd">
                            <a class="js-add-business" href="<?php echo "#identities_new_business"; ?>">+</a>
                        </dd>
                    </dl>
                    <ul class="js-identities-container tabs-content">
                        <?php $i = 1; ?>
                        <?php foreach ($businesses as $primary_key => $business): ?>
                            <li class="identity <?php echo $i === 1 ? 'active' : ''; ?>" data-primary-key="<?php echo $primary_key; ?>" id="<?php echo "identities_business_{$primary_key}Tab"; ?>">
                                <div class="row">
                                    <div class="twelve columns">
                                        <label for="business_<?php echo $primary_key; ?>_brand_name"><?php echo __('settings:brand_name') ?></label>

                                        <p class="settings-explain"><?php echo __('settings:brand_name_explanation'); ?></p>
                                        <input type="text" id="business_<?php echo $primary_key; ?>_brand_name" name="businesses[<?php echo $primary_key; ?>][brand_name]" value="<?php echo $business['brand_name']; ?>" class="txt"/>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="twelve columns">
                                        <label for="business_<?php echo $primary_key; ?>_site_name"><?php echo __('settings:business_name') ?></label>

                                        <p class="settings-explain"><?php echo __('settings:business_name_explanation'); ?></p>
                                        <input type="text" id="business_<?php echo $primary_key; ?>_site_name" name="businesses[<?php echo $primary_key; ?>][site_name]" value="<?php echo $business['site_name']; ?>" class="txt"/>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="twelve columns">
                                        <label for="business_<?php echo $primary_key; ?>_admin_name"><?php echo __('settings:admin_name') ?></label>

                                        <p class="settings-explain"><?php echo __('settings:admin_name_explanation'); ?></p>
                                        <input type="text" id="business_<?php echo $primary_key; ?>_admin_name" name="businesses[<?php echo $primary_key; ?>][admin_name]" value="<?php echo $business['admin_name']; ?>" class="txt"/>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="twelve columns">
                                        <label for="business_<?php echo $primary_key; ?>_billing_email" for="billing_email"><?php echo __('settings:billing_email') ?></label>

                                        <p class="settings-explain"><?php echo __('settings:billing_email_explanation'); ?></p>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="six columns">
                                        <label class="sub-label"><?php echo __("global:name") ?></label>
                                        <input type="text" name="businesses[<?php echo $primary_key; ?>][billing_email_from]" value="<?php echo $business['billing_email_from']; ?>" class="txt"/>
                                    </div>
                                    <div class="six columns">
                                        <label class="sub-label"><?php echo __("global:email") ?></label>
                                        <input type="text" name="businesses[<?php echo $primary_key; ?>][billing_email]" value="<?php echo $business['billing_email']; ?>" class="txt"/>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="twelve columns">
                                        <label for="business_<?php echo $primary_key; ?>_notify_email" for="notify_email"><?php echo __('settings:notify_email') ?></label>

                                        <p class="settings-explain"><?php echo __('settings:notify_email_explanation'); ?></p>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="six columns">
                                        <label class="sub-label"><?php echo __("global:name") ?></label>
                                        <input type="text" name="businesses[<?php echo $primary_key; ?>][notify_email_from]" value="<?php echo $business['notify_email_from']; ?>" class="txt"/>
                                    </div>
                                    <div class="six columns">
                                        <label class="sub-label"><?php echo __("global:email") ?></label>
                                        <input type="text" name="businesses[<?php echo $primary_key; ?>][notify_email]" value="<?php echo $business['notify_email']; ?>" class="txt"/>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="twelve columns">
                                        <label for="business_<?php echo $primary_key; ?>_mailing_address" for="mailing_address"><?php echo __('settings:mailing_address') ?></label>
                                        <textarea name="businesses[<?php echo $primary_key; ?>][mailing_address]" rows="6"><?php echo $business['mailing_address']; ?></textarea>
                                    </div>
                                </div>
                                <?php Business::setBusiness($primary_key); ?>
                                <div class="row">
                                    <label class="twelve columns" for="business_<?php echo $primary_key; ?>_logo"><?php echo __('settings:logo') ?></label>

                                    <div class="twelve columns">
                                        <?php if (Business::getLogo(true, false) != '') : ?>
                                            <div class='logo-business-identity'><?php echo Business::getLogo(true, false, 1, array('ignore_show_name' => true)); ?></div>
                                        <?php endif; ?>
                                        <input type="hidden" class="remove-logo-filename-input" name="businesses[<?php echo $primary_key; ?>][remove_logo_filename]" value="0">
                                        <input type="file" name="businesses[<?php echo $primary_key; ?>][logo]"/>
                                        <?php if (Business::getLogo(true, false) != '') : ?>
                                            <a href="#" class="icon delete remove-logo" title="<?php echo __('settings:removelogo') ?>"></a>
                                        <?php endif; ?>
                                        <p class="settings-explain"><?php echo __('settings:logodimensions'); ?>
                                            <br/><?php echo __('settings:logoformatsallowed'); ?></p>

                                        <p class="settings-explain">
                                            <input type="checkbox" name="businesses[<?php echo $primary_key; ?>][show_name_along_with_logo]" <?php echo $business['show_name_along_with_logo'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                                            <?php echo __('settings:show_name_along_with_logo'); ?>
                                        </p>
                                    </div>
                                </div>

                                <hr>

                                <div class="row">
                                    <div class="twelve columns">
                                        <label for="default_invoice_notes"><?php echo __('settings:default_invoice_notes') ?></label>
                                        <textarea name="businesses[<?php echo $primary_key; ?>][default_invoice_notes]" class="redactor" rows="6"><?php echo $business['default_invoice_notes']; ?></textarea>
                                    </div>
                                </div>
                                <br />
                                <div class="row">
                                    <div class="twelve columns">
                                        <label for="pdf_footer_contents">
                                            <?php echo __('settings:pdf_footer_contents') ?>
                                            <a target="_blank" class="pull-right" href="<?php echo site_url("admin/settings/email_variables"); ?>"><?php echo __("settings:what_variables_can_i_use"); ?></a>
                                        </label>
                                        <p class="settings-explain"><?php echo __('settings:pdf_footer_contents_explanation'); ?></p>
                                        <textarea name="businesses[<?php echo $primary_key; ?>][pdf_footer_contents]" rows="2"><?php echo $business['pdf_footer_contents']; ?></textarea>
                                    </div>
                                </div>
                                <br/>
                                <div class="row">
                                    <div class="twelve columns">
                                        <label for="remittance_slip">
                                            <?php echo __('settings:remittance_slip') ?>
                                            <a target="_blank" class="pull-right" href="<?php echo site_url("admin/settings/email_variables"); ?>"><?php echo __("settings:what_variables_can_i_use"); ?></a>
                                        </label>
                                        <textarea name="businesses[<?php echo $primary_key; ?>][remittance_slip]" rows="10"><?php echo $business['remittance_slip']; ?></textarea>
                                    </div>
                                </div>
                                <div class="row">
                                    <label class="four columns"><?php echo __('settings:include_remittance_slip') ?></label>

                                    <div class="eight columns">
                                        <input id="include_remittance_slip" type="checkbox" name="businesses[<?php echo $primary_key; ?>][include_remittance_slip]" <?php echo $business['include_remittance_slip'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                                        <small><?php echo __('settings:include_remittance_slip_explain'); ?></small>
                                    </div>
                                </div>
                            </li>
                            <?php $i++; ?>
                        <?php endforeach; ?>
                        <?php Business::setBusiness(Business::ANY_BUSINESS); ?>
                    </ul>
                </div>

                <div id="taxes">
                    <div class="row">
                        <div class="twelve columns">
                            <label for="default_tax_id"><?php echo __("settings:default_taxes") ?></label>
                            <select id="default_tax_id" name="default_tax_id[]" multiple="multiple" class="multiselect" data-nothing-selected-label="<?php echo __("settings:no_tax"); ?>">
                                <?php $default_tax_ids = Settings::get_default_tax_ids(); ?>
                                <?php foreach (Settings::all_taxes() as $id => $tax): ?>
                                    <option value="<?php echo $id; ?>" <?php echo (in_array($id, $default_tax_ids)) ? 'selected="selected"' : ''; ?>><?php echo $tax['name']; ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>

                    <div class="row">
                        <label class="four columns"><?php echo __('settings:hide_tax_column'); ?></label>

                        <div class="eight columns">
                            <input id="hide_tax_column" type="checkbox" name="hide_tax_column" <?php echo $settings['hide_tax_column'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                        </div>
                        <div class="twelve columns">
                            <p class="settings-explain"><?php echo __('settings:hide_tax_column_explanation'); ?></p>
                            <br/>
                        </div>
                    </div>

                    <div class="row">
                        <label class="four columns"><?php echo __('settings:tax_transaction_fees'); ?></label>

                        <div class="eight columns">
                            <input id="tax_transaction_fees" type="checkbox" name="tax_transaction_fees" <?php echo $settings['tax_transaction_fees'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                        </div>
                        <div class="twelve columns">
                            <p class="settings-explain"><?php echo __('settings:tax_transaction_fees_explanation'); ?></p>
                            <br/>
                        </div>
                    </div>

                    <table class="pc-table settings-with-no-margin" cellspacing="0" style="width: 100%;">
                        <thead>
                            <tr>
                                <th><?php echo __('settings:tax_name') ?></th>
                                <th><?php echo __('settings:tax_value') ?> (%)</th>
                                <th><?php echo __('settings:tax_reg') ?></th>
                                <th><?php echo __('settings:tax_compound') ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach (Settings::all_taxes() as $id => $tax): ?>
                                <tr>
                                    <td><?php echo form_input(array(
                                            'name' => 'tax_name[' . $id . ']',
                                            'value' => set_value('tax_name[' . $id . ']', $tax['name']),
                                            'class' => 'txt small',
                                        )); ?></td>
                                    <td><?php echo form_input(array(
                                            'name' => 'tax_value[' . $id . ']',
                                            'value' => set_value('tax_value[' . $id . ']', @$tax['value']),
                                            'class' => 'txt small',
                                        )); ?></td>
                                    <td><?php echo form_input(array(
                                            'name' => 'tax_reg[' . $id . ']',
                                            'value' => set_value('tax_reg[' . $id . ']', @$tax['reg']),
                                            'class' => 'txt small',
                                        )); ?></td>
                                    <td class="checkbox-td">
                                        <input type="checkbox" name="tax_compound[<?php echo $id; ?>]" <?php echo set_checkbox("tax_compound[$id]", 1, @$tax['is_compound']); ?> value="1">
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>

                    <br/>

                    <a href="#" id="add-tax" class="blue-btn"><span><?php echo __('settings:add_tax') ?></span></a>

                    <br/>
                </div><!--/taxes-->

                <div id="currencies">

                    <div class="row">
                        <div class="twelve columns">
                            <label for="currency"><?php echo __('settings:currency') ?></label>
                            <span class="sel-item"><?php echo form_dropdown('currency', $currencies, $settings['currency']); ?></span>
                        </div>
                    </div>

                    <br/>

                    <table class="pc-table" cellspacing="0" style="width: 100%;">
                        <thead>
                            <tr>
                                <th><?php echo __('settings:currency_name') ?></th>
                                <th><?php echo __('settings:currency_code') ?></th>
                                <th><?php echo __('settings:currency_format') ?></th>
                                <th><?php echo __('settings:exchange_rate') ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach (Settings::all_currencies() as $id => $currency): ?>
                                <tr>
                                    <td><?php echo form_input(array(
                                            'name' => 'currency_name[' . $id . ']',
                                            'value' => set_value('currency_name[' . $id . ']', $currency['name']),
                                            'class' => 'txt small',
                                        )); ?></td>
                                    <td><?php echo form_input(array(
                                            'name' => 'currency_code[' . $id . ']',
                                            'value' => set_value('currency_code[' . $id . ']', $currency['code']),
                                            'class' => 'txt small',
                                        )); ?></td>
                                    <td>
								<span class="sel-item">
									<?php echo form_dropdown('currency_format[' . $id . ']', currency_formats(), base64_encode($currency['format']), 'class="js-currency-format"'); ?>
								</span>
                                    </td>
                                    <td><?php echo form_input(array(
                                            'name' => 'currency_rate[' . $id . ']',
                                            'value' => set_value('currency_rate[' . $id . ']', $currency['rate']),
                                            'class' => 'txt small',
                                            'style' => 'width: 78px;float:left;',
                                        )); ?>
                                        <span style="float:left;margin-top: 8px;margin-left: 6px;"> = <span class="js-currency-symbol"><?php echo Currency::symbol() ?></span>1</span>
                                    </td>
                                </tr>
                            <?php endforeach; ?>

                            <?php if (!Settings::all_currencies()): ?>
                                <tr>
                                    <td><input name="new_currency_name[]" value="" class="txt small text" type="text">
                                    </td>
                                    <td>
                                        <input name="new_currency_code[]" value="" class="txt small currency_code text" type="text">
                                    </td>
                                    <td>
								<span class="sel-item">
									<?php echo form_dropdown('new_currency_format[]', currency_formats(), array(), 'class="js-currency-format"'); ?>
								</span>
                                    </td>
                                    <td>
                                        <input name="new_currency_rate[]" value="" class="txt small currency_rate text" type="text">
                                    </td>
                                </tr>
                            <?php endif ?>
                        </tbody>
                    </table>

                    <br/>

                    <a href="#" id="add-currency" class="blue-btn"><span><?php echo __('settings:add_currency') ?></span></a>

                    <br/>
                </div><!--/currencies-->

                <!-- Start The Template Section -->
                <div id="templates">

                    <div class="row">
                        <div class="twelve columns">
                            <label><?php echo __('settings:bcc') ?></label>
                            <input type="checkbox" name="bcc" <?php echo $settings['bcc'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                            <small><?php echo __('settings:automaticallybccclientemail'); ?></small>
                        </div><!-- /12 -->
                    </div><!-- /row -->

                    <div class="row">
                        <div class="twelve columns">
                            <label><?php echo __("settings:pdf_attachments"); ?></label>
                            <input id="enable_pdf_attachments" type="checkbox" name="enable_pdf_attachments" <?php echo $settings['enable_pdf_attachments'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                            <small><?php echo __("settings:pdf_attachments_explanation"); ?></small>
                        </div>
                    </div>

                    <div class="row">
                        <div class="twelve columns">
                            <label>Email Server</label>
                                        <span class="sel-item">
                                            <?php echo form_dropdown('email_server', $email_servers, $email['type']); ?>
                                        </span>
                        </div>
                    </div>

                    <div class="smtp row">
                        <div class="six columns">
                            <label>SMTP Host</label>
                            <input type="text" name="smtp_host" value="<?php echo htmlentities($email['smtp_host']); ?>" class="txt"/>
                        </div>

                        <div class="three columns">
                            <label>SMTP Port</label>
                            <input type="text" name="smtp_port" value="<?php echo $email['smtp_port']; ?>" class="txt"/>
                        </div>

                        <div class="three columns">
                            <label>Encryption</label>
						<span class="sel-item">
                        	<?php echo form_dropdown('smtp_encryption', array("" => "None", "ssl" => "SSL", "tls" => "TLS"), $email['smtp_encryption']); ?>
                        </span>
                        </div>

                        <br class="clear"/>

                        <div class="six columns">
                            <label>SMTP Username</label>
                            <input type="text" name="smtp_user" value="<?php echo $email['smtp_user']; ?>" class="txt"/>
                        </div>

                        <div class="six columns">
                            <label>SMTP Password</label>
                            <input type="password" name="smtp_pass" value="<?php echo $email['smtp_pass']; ?>" class="txt"/>
                        </div>
                    </div>

                    <div class="gmail row">
                        <div class="twelve columns">
                            <?php if ($email['type'] == "gmail"): ?>
                                <?php if ($email['smtp_user']): ?>
                                    <p><?php echo __("settings:you_are_using_old_auth", [$email['smtp_user']]); ?></p>
                                <?php else: ?>
                                    <p><?php echo __("settings:you_are_signed_in", [$settings['gmail_email']]); ?></p>
                                <?php endif; ?>
                            <?php endif; ?>
                            <a target="_blank" href="<?php echo $this->settings_m->get_oauth2gmail_url(); ?>" class="google-signin-button"></a>
                            <p><?php echo __("settings:pancake_uses_our_servers"); ?></p>
                        </div>
                    </div>

                    <div class="row">
                        <div class="twelve columns">
                            <a href='<?php echo site_url("admin/settings/test_email"); ?>' class='blue-btn js-send-test-email'><?php echo __("settings:send_test_email"); ?></a>
                            <br/>
                            <br/>
                        </div>
                    </div>
                    <?php foreach ($email_templates as $email_template): ?>
                        <div class="email-template">
                            <div class="row">
                                <div class="twelve columns">
                                    <?php

                                    $email_template_title = __('email_templates:' . $email_template['identifier']);
                                    if ($email_template_title == 'email_templates:' . $email_template['identifier']) {
                                        $new_title = __('global:' . $email_template['identifier']);
                                        if ($new_title != 'global:' . $email_template['identifier']) {
                                            $email_template_title = $new_title;
                                        }
                                    }

                                    ?>
                                    <h4 class="expand-email-template"><?php echo $email_template_title; ?>
                                        <a href="#">[+]</a></h4>

                                    <div class="expandable-email-template-container">
                                        <label for="<?php echo $email_template['identifier']; ?>_subject">
                                            <?php echo __('settings:default_subject') ?>
                                            <a target="_blank" class="pull-right" href="<?php echo site_url("admin/settings/email_variables"); ?>"><?php echo __("settings:what_variables_can_i_use"); ?></a>
                                        </label>
                                        <input type="text" name="email_templates[<?php echo $email_template['identifier']; ?>][subject]" id="<?php echo $email_template['identifier']; ?>_subject" value="<?php echo isset($_POST['email_templates'][$email_template['identifier']]['subject']) ? $_POST['email_templates'][$email_template['identifier']]['subject'] : $email_template['subject']; ?>" class="txt"/>
                                        <label for="email_new_invoice">
                                            <?php echo __('settings:default_contents') ?>
                                            <a target="_blank" class="pull-right" href="<?php echo site_url("admin/settings/email_variables"); ?>"><?php echo __("settings:what_variables_can_i_use"); ?></a>
                                        </label>
                                        <textarea name="email_templates[<?php echo $email_template['identifier']; ?>][message]" id="<?php echo $email_template['identifier']; ?>_message" rows="8" cols="70" class="txt"><?php echo isset($_POST['email_templates'][$email_template['identifier']]['message']) ? $_POST['email_templates'][$email_template['identifier']]['message'] : $email_template['message']; ?></textarea>
                                    </div>
                                </div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div><!--/templates-->

                <div id="branding">

                    <div class="row">
                        <div class="six columns">
                            <label for="theme"><?php echo __('settings:theme') ?></label>
		      		<span class="sel-item">
			      		<select name="theme">
                            <?php foreach (glob(FCPATH . 'third_party/themes/*') as $theme):
                                if (basename($theme) == 'admin' || strstr(basename($theme), '.')) {
                                    continue;
                                } ?>
                                <option value="<?php echo basename($theme); ?>" <?php echo html(basename($theme)) == $settings['theme'] ? 'selected="selected"' : ''; ?>>
                                    <?php echo humanize(str_replace(array(".", "_", "-"), " ", basename($theme))); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
		      		</span>
                        </div><!-- /4 -->

                        <div class="six columns">
                            <label for="admin_theme"><?php echo __('settings:admin_theme') ?></label>
							<span class="sel-item">
								<select name="admin_theme">
                                    <?php foreach (glob(FCPATH . 'third_party/themes/admin/*') as $theme): ?>
                                        <option value="<?php echo basename($theme); ?>" <?php echo html(basename($theme)) == $settings['admin_theme'] ? 'selected="selected"' : ''; ?>>
                                            <?php echo humanize(str_replace(array(".", "_", "-"), " ", basename($theme))); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
							</span>
                        </div><!-- /8 -->
                    </div>

                    <h2><?php echo __('global:css'); ?></h2>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="frontend_css"><?php echo __('settings:frontend_css') ?></label>
                            <?php echo form_textarea(array(
                                'name' => 'frontend_css',
                                'id' => 'frontend_css',
                                'rows' => 8,
                                'cols' => 70,
                                'value' => unhtml($settings['frontend_css']),
                            )); ?>
                        </div>
                    </div>

                    <br/>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="backend_css"><?php echo __('settings:backend_css') ?></label>
                            <?php echo form_textarea(array(
                                'name' => 'backend_css',
                                'id' => 'backend_css',
                                'rows' => 8,
                                'cols' => 70,
                                'value' => unhtml($settings['backend_css']),
                            )); ?>
                        </div>
                    </div>

                    <h2><?php echo __('global:js'); ?></h2>

                    <p><?php echo __("global:js_explanation"); ?></p>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="frontend_js"><?php echo __('settings:frontend_js') ?></label>
                            <?php echo form_textarea(array(
                                'name' => 'frontend_js',
                                'id' => 'frontend_js',
                                'rows' => 8,
                                'cols' => 70,
                                'value' => unhtml($settings['frontend_js']),
                            )); ?>
                        </div>
                    </div>

                    <br/>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="backend_js"><?php echo __('settings:backend_js') ?></label>
                            <?php echo form_textarea(array(
                                'name' => 'backend_js',
                                'id' => 'backend_js',
                                'rows' => 8,
                                'cols' => 70,
                                'value' => unhtml($settings['backend_js']),
                            )); ?>
                        </div>
                    </div>

                </div><!-- /branding -->

                <div id="payment">

                    <div>
                        <?php if (count($businesses) > 1): ?>
                            <?php $tab_class = digit_to_tab_up(count($businesses)); ?>
                            <dl class="tabs <?php echo $tab_class; ?>">
                                <?php $i = 1; ?>
                                <?php foreach ($businesses as $business_id => $business): ?>
                                    <dd class="<?php echo $i === 1 ? 'active' : ''; ?>">
                                        <a href="<?php echo "#payment_business_{$business_id}"; ?>"><?php echo $business['brand_name']; ?></a>
                                    </dd>
                                    <?php $i++; ?>
                                <?php endforeach; ?>
                            </dl>
                        <?php endif; ?>
                        <ul class="tabs-content">
                            <?php $i = 1; ?>
                            <?php foreach ($businesses as $business_id => $business): ?>
                                <li class="<?php echo $i === 1 ? 'active' : ''; ?>" id="<?php echo "payment_business_{$business_id}Tab"; ?>">
                                    <?php foreach (Gateway::get_gateways($business_id, null, false) as $gateway) : ?>
                                        <?php
                                        if (empty($gateway['gateway'])) {
                                            continue;
                                        }
                                        $enabled = $gateway['enabled'] ? 'checked="checked"' : '';
                                        ?>
                                        <div class="gateway">
                                            <h5><?php echo $gateway['title'] ?>
                                                <?php if ($gateway['show_version']) : ?>
                                                    <?php echo $gateway['version'] ?> (<?php echo htmlentities($gateway['author']); ?>)
                                                <?php endif; ?>
                                            </h5>

                                            <div class="gateway-input row">
                                                <div class="twelve columns">
                                                    <label for="<?php echo $gateway['gateway']; ?>-enabled"><?php echo __('global:is_enabled') ?></label>
                                                    <input type="checkbox" class="enabled" value="1" id="<?php echo $gateway['gateway']; ?>-enabled" name="gateways[<?php echo $business_id; ?>][<?php echo $gateway['gateway']; ?>][enabled]" <?php echo $enabled; ?> />
                                                </div><!-- /12 -->
                                            </div>

                                            <div class="gateway-fields">
                                                <?php if ($gateway['requires_https'] or $gateway['requires_pci']) : ?>
                                                    <p class="pci_warning">Warning: If you use this gateway, you will<?php if ($gateway['requires_pci']): ?> be legally required to comply with PCI laws and regulations. You will also<?php endif; ?> need to be able to load Pancake using HTTPS.</p>
                                                <?php endif; ?>

                                                <?php if (!empty($gateway['notes'])) : ?>
                                                    <p class="pci_warning"><?php echo $gateway['notes']; ?></p>
                                                <?php endif; ?>

                                                <?php foreach ($gateway['fields'] as $field_name => $field) : ?>
                                                    <div class="gateway-input row">
                                                        <div class="twelve columns">
                                                            <label for="<?php echo $gateway['gateway']; ?>-<?php echo $field_name; ?>">
                                                                <?php echo $field["label"]; ?>
                                                                <?php if (isset($field["help"])): ?>
                                                                    <br/>
                                                                    <small><?php echo $field["help"]; ?></small>
                                                                <?php endif; ?>
                                                            </label>

                                                            <?php $id = "{$business_id}-{$gateway['gateway']}-{$field_name}"; ?>
                                                            <?php $name = "gateways[{$business_id}][{$gateway['gateway']}][{$field_name}]"; ?>
                                                            <?php $value = isset($gateway['field_values'][$field_name]) ? $gateway['field_values'][$field_name] : ''; ?>

                                                            <?php if ($field["type"] == "text"): ?>
                                                                <input type="text" class="txt text" id="<?php echo $id; ?>" value="<?php echo $value; ?>" name="<?php echo $name; ?>"/>
                                                            <?php elseif ($field["type"] == "checkbox"): ?>
                                                                <input type="checkbox" class="txt text" id="<?php echo $id; ?>" value="1" <?php echo $value ? 'checked="checked"' : ''; ?> name="<?php echo $name; ?>"/>
                                                            <?php elseif ($field["type"] == "select"): ?>
                                                                <span class="sel-item">
                                                                    <?php form_dropdown($name, $field["options"], $value, 'id="' . $id . '"'); ?>
                                                                </span>
                                                            <?php endif; ?>
                                                        </div><!-- /12 -->
                                                    </div><!-- /gateway input -->
                                                <?php endforeach; ?>
                                            </div><!-- /gateway fields -->
                                        </div><!-- /gateway -->
                                    <?php endforeach; ?>
                                </li>
                                <?php $i++; ?>
                            <?php endforeach; ?>
                        </ul>
                    </div>
                </div>

                <div id="errors_and_diagnostics">
                    <?php if (!is_php("5.6")): ?>
                        <div class="diagnostic-warning">
                            <h4><?php echo __("error:php_outdated"); ?></h4>

                            <p><?php echo __("error:using_old_php", [PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION, "August 2014"]); ?></p>
                            <h5><?php echo __("error:pancake_will_stop_supporting_it"); ?></h5>

                            <p><?php echo __("error:why_update"); ?><?php echo __("error:upgrade_php", ["5.6", "7.0"]); ?></p>
                        </div>
                    <?php endif; ?>

                    <div class="diagnostic-integrity">
                        <h4><?php echo __("error:scan_pancake"); ?></h4>

                        <p><?php echo __("error:scan_pancake_explanation"); ?></p>
                        <a href='<?php echo site_url("admin/settings/verify_integrity"); ?>' class='btn js-verify-integrity'><?php echo __("error:scan"); ?></a>

                        <div class="js-integrity-result-container">

                        </div>
                    </div>

                    <?php if (count($error_logs) == 0): ?>
                        <div class="row">
                            <div class="twelve columns">
                                <h4><?php echo __("error:no_logged_errors"); ?></h4>
                            </div>
                        </div>
                    <?php else: ?>
                        <div class="row">
                            <div class="twelve columns">
                                <table style="width: 100%; table-layout: fixed;">
                                    <thead>
                                        <tr>
                                            <th><?php echo __("global:error"); ?></th>
                                            <th style="width: 170px;"><?php echo __("global:actions"); ?></th>
                                        </tr>
                                    </thead>
                                    <tbody class="report-buttons">
                                        <?php foreach ($error_logs as $error_log): ?>
                                            <tr>
                                                <?php
                                                if ($error_log['occurrences'] == 1) {
                                                    $occurrences = strtolower(__("global:once"));
                                                } elseif ($error_log['occurrences'] == 2) {
                                                    $occurrences = strtolower(__("global:twice"));
                                                } else {
                                                    $occurrences = __("global:x_times", array($error_log['occurrences']));
                                                }
                                                ?>
                                                <td class="details-container">
                                                    [<?php echo format_date(strtotime($error_log['first_occurrence']), true); ?>] <?php echo __("global:occurred_times", array($occurrences)); ?>.
                                                    <br/>
                                                    <br/>
                                                    <?php echo htmlentities($error_log['subject'], ENT_QUOTES, "UTF-8"); ?>
                                                    <br/>
                                                    <br/>
                                                    <a href="<?php echo site_url("admin/settings/view_error/{$error_log['id']}"); ?>" target="_blank"><?php echo __("settings:view_error_details"); ?></a>
                                                    <?php if ($error_log['is_reported']): ?>
                                                        <br/>
                                                        <br/>
                                                        <?php echo str_ireplace("{email}", $error_log['notification_email'], __("error:response_will_be_sent_to_email")); ?>
                                                    <?php endif; ?>
                                                </td>
                                                <td class="button-container">
                                                    <?php if ($error_log['is_reportable']): ?>
                                                        <a href='<?php echo site_url("send_error_report/{$error_log['id']}"); ?>' class='btn js-report-error <?php echo($error_log['is_reported'] ? "success wide-success" : ""); ?>'><?php echo __($error_log['is_reported'] ? "settings:error_reported" : "settings:report_error"); ?></a>
                                                        <br/>
                                                    <?php endif; ?>
                                                    <a href='<?php echo site_url("admin/settings/delete_error/{$error_log['id']}"); ?>' class='btn js-delete-error'><?php echo __("settings:delete_error"); ?></a>
                                                </td>
                                            </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    <?php endif; ?>
                </div>
                <div id="update">
                    <?php if (!$temporary_no_internet_access) : ?>
                        <div class="row">
                            <div class="twelve columns">
                                <h4 class="latest-version"><?php echo __('settings:' . ($outdated ? 'newversionavailable' : 'uptodate'), array($latest_version)); ?></h4>

                                <div class="cf">
                                    <a href="<?php echo site_url('check_latest_version'); ?>" class="blue-btn upgrade-btn" data-loading-text="<?php echo __("settings:checking_for_updates") ?>"><span><?php echo __('settings:checkforupdates'); ?></span></a>
                                    <br/>
                                    <br/>
                                </div>

                                <?php if (!$this->update->write) : ?>
                                    <div class="row">
                                        <div class="twelve columns">
                                            <h4>FTP Settings</h4>

                                            <p><?php echo __('settings:nophpupdates') ?></p>

                                            <p><?php echo __('error:update_without_ftp') ?></p>
                                        </div>

                                        <div class="twelve columns">
                                            <label><?php echo __('settings:ftp_user') ?></label>
                                            <input type="text" name="ftp_user" value="<?php echo $settings['ftp_user']; ?>" class="txt"/>
                                        </div>

                                        <div class="twelve columns">
                                            <label><?php echo __('settings:ftp_pass') ?></label>
                                            <input type="password" name="ftp_pass" value="<?php echo $settings['ftp_pass']; ?>" class="txt"/>
                                        </div>

                                        <div class="twelve columns">
                                            <label><?php echo __('settings:ftp_host') ?></label>
                                            <input type="text" name="ftp_host" value="<?php echo empty($settings['ftp_host']) ? $guessed_ftp_host : $settings['ftp_host']; ?>" class="txt"/>
                                        </div>

                                        <div class="twelve columns">
                                            <label><?php echo __('settings:ftp_path') ?></label>
                                            <input type="text" name="ftp_path" value="<?php echo $settings['ftp_path']; ?>" class="txt"/>
                                        </div>

                                        <div class="twelve columns">
                                            <label><?php echo __('settings:ftp_port') ?></label>
                                            <input type="text" name="ftp_port" value="<?php echo $settings['ftp_port']; ?>" class="txt"/>
                                        </div>

                                        <div class="twelve columns">
                                            <label><?php echo __('settings:ftp_pasv') ?></label>
                                            <input type="checkbox" name="ftp_pasv" <?php echo $settings['ftp_pasv'] == 1 ? 'checked="checked"' : 0; ?> value="1" class="txt"/>
                                        </div>
                                    </div><!-- /row-->
                                <?php endif; ?>

                                <?php if ($outdated) : ?>
                                    <div class='changelog-container'>
                                        <?php if ($conflicted_files != array()) : ?>
                                            <div class="conflicted">
                                                <p class="conflict-warning"><?php echo __("settings:will_have_to_overwrite_" . (count($conflicted_files) == 1 ? "single_file" : "multiple_files"), array(count($conflicted_files))); ?></p>
                                                <ul>
                                                    <?php foreach ($conflicted_files as $file => $operation) : ?>
                                                        <li>
                                                            <small><?php echo $operation == 'M' ? '[You modified]' : '[You deleted]'; ?><?php echo $file; ?></small>
                                                        </li>
                                                    <?php endforeach; ?>
                                                </ul>
                                            </div><!-- /conflictted -->

                                            <p class="conflict-reviewfiles"><?php echo __('update:review_files'); ?>
                                                <br/> <br/><?php echo __('update:ifyourenotsurecontactus') ?></p>
                                        <?php endif; ?>

                                        <?php if (($update->write or $update->ftp)) : ?>

                                            <div class="cf">
                                                <a href="<?php echo site_url('admin/upgrade/update'); ?>" class="blue-btn upgrade-btn" data-loading-text="<?php echo __("settings:updating_please_wait"); ?>"><span><?php echo __('settings:updatenow'); ?></span></a>
                                            </div>
                                        <?php else: ?>
                                            <p class="youneedtoconfigurefirst"><?php echo __('settings:youneedtoconfigurefirst'); ?></p>
                                        <?php endif; ?> <!-- /changelog -->

                                        <h4 class="whatschanged"><?php echo __('update:whatschanged', array($latest_version)); ?></h4>

                                        <div class="changelog"><?php echo $changelog; ?></div>
                                    </div>
                                <?php endif; ?>
                                <?php if (count($outdated_plugins) > 0): ?>
                                    <h4><?php echo count($outdated_plugins); ?> Pancake Store item<?php echo count($outdated_plugins) > 1 ? "s are" : " is"; ?> out of date</h4>
                                    <div class="cf">
                                        <a href="<?php echo site_url('admin/store/update'); ?>" class="blue-btn upgrade-plugins-btn" style="color: white;" data-loading-text="<?php echo __("settings:updating_please_wait") ?>"><span><?php echo __('store:updatestoreitems'); ?></span></a>
                                    </div>
                                    <h4>What's new</h4>
                                    <?php foreach ($outdated_plugins as $unique_id => $plugin): ?>
                                        <div class="outdated-plugin">
                                            <h4><?php echo $plugin['plugin_title']; ?>
                                                <small><?php echo $plugin['type']; ?></small>
                                            </h4>
                                            <?php foreach ($plugin['changelog_since_current_version'] as $change): ?>
                                                <h6><?php echo $change['version']; ?></h6>
                                                <?php echo $change['changelog']; ?>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endforeach; ?>
                                <?php endif; ?>

                            </div>
                        </div><!-- /row -->

                    <?php else: ?>
                        <h4 class="latest-version"><?php echo __('update:internetissues'); ?></h4>
                        <p><?php echo __("error:update_system_cannot_update"); ?></p>
                    <?php endif; ?>
                </div>

                <!-- Start of importexport -->
                <div id="importexport">
                    <h4><?php echo __('settings:import'); ?></h4>

                    <div class="row">
                        <div class="twelve columns">
                            <label for="file_to_import[]"><?php echo __('settings:file_to_import') ?></label>
                            <input type="file" name="file_to_import[]"/>

                            <p class="explanation">
                                <small><?php echo __('settings:file_should_be_csv'); ?></small>
                            </p>
                        </div>
                    </div><!-- /row -->

                    <div class="row">
                        <div class="twelve columns">
                            <label>What are you importing?</label>
                            <span class="sel-item"><?php echo form_dropdown('import_type', $import_types, 'invoices'); ?></span>
                        </div>
                    </div>

                    <div class="row">
                        <div class="cf twelve columns">
                            <a href="#" class="blue-btn import-btn"><span><?php echo __('settings:importnow'); ?></span></a>
                        </div>
                    </div>

                    <br/>

                    <h4><?php echo __('settings:export'); ?></h4>

                    <div class="row">
                        <div class="twelve columns">
                            <label><?php echo __('settings:whatexporting'); ?></label>
                            <span class="sel-item"><?php echo form_dropdown('export_type', $export_types, 'invoices'); ?></span>
                        </div>
                    </div>

                    <div class="row">
                        <div class="cf twelve columns">
                            <a href="#" class="blue-btn export-btn"><span><?php echo __('settings:exportnow'); ?></span></a>
                        </div>
                    </div>

                </div>

                <div id="feeds">
                    <div class="row">
                        <div class="twelve columns">
                            <label for="rss_password"><?php echo __('settings:rss_password') ?></label>
                            <?php echo form_input(array(
                                'name' => 'rss_password',
                                'id' => 'rss_password',
                                'class' => 'txt',
                                'value' => set_value('rss_password', $settings['rss_password']),
                            )); ?>
                        </div><!-- /12-->
                    </div><!-- /row -->

                    <div class="row">
                        <div class="twelve columns add-bottom">
                            <h4><?php echo __('settings:cron_job_feed') ?></h4>
                            <p class="explanation"><?php echo __("settings:last_cron_run_datetime", [$settings["last_cron_run_datetime"] ? format_date($settings["last_cron_run_datetime"], true) : __("global:na")]); ?></p>
                            <?php echo anchor('cron/invoices/' . PAN::setting('rss_password')); ?>
                        </div>
                    </div>

                    <h4><?php echo __('settings:default_feeds') ?></h4>

                    <div class="row">
                        <div class="twelve columns add-bottom">
                            <label for="nothing"><?php echo __('global:paid') ?>:</label>
                            <?php echo anchor('feeds/paid/10/' . PAN::setting('rss_password')); ?>
                        </div>

                        <div class="twelve columns add-bottom">
                            <label for="nothing"><?php echo __('global:unpaid') ?>:</label>
                            <?php echo anchor('feeds/unpaid/10/' . PAN::setting('rss_password')); ?>
                        </div>

                        <div class="twelve columns add-bottom">
                            <label for="nothing"><?php echo __('global:overdue') ?>:</label>
                            <?php echo anchor('feeds/overdue/10/' . PAN::setting('rss_password')); ?>
                        </div>
                    </div>

                    <h4><?php echo __('settings:feed_generator') ?></h4>

                    <div id="feed_generator">
                        <div class="row">
                            <div class="six columns">
                                <label for="rss_type"><?php echo __('global:type') ?>:</label>
							<span class="sel-item">
								<select name="rss_type" id="rss_type">
                                    <option value="paid"><?php echo __('global:paid') ?></option>
                                    <option value="unpaid"><?php echo __('global:unpaid') ?></option>
                                    <option value="overdue"><?php echo __('global:overdue') ?></option>
                                </select>
							</span>
                            </div>

                            <div class="six columns">
                                <label for="rss_items"><?php echo __('global:items') ?>:</label>
                                <input type="text" name="rss_items" id="rss_items" value="10" size="5" class="txt"/>
                            </div>
                        </div>

                        <div class="row">
                            <div class="twelve columns">
                                <label for="nothing"><?php echo __('settings:your_link') ?>:</label>
                                <span id="rss_link_gen">&nbsp;</span>
                            </div>
                        </div>
                    </div><!-- /feed_generator -->
                </div><!--/feeds-->

                <div id="api_keys">
                    <table class="pc-table" cellspacing="0" style="width: 100%;">
                        <thead>
                            <tr>
                                <th><?php echo __('settings:api_note') ?></th>
                                <th><?php echo __('settings:api_key') ?></th>
                                <th><?php echo __('global:created') ?></th>
                                <th><?php echo __('global:remove') ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($api_keys as $key): ?>
                                <tr>
                                    <td><?php echo form_input(array(
                                            'name' => 'key_note[' . $key->id . ']',
                                            'value' => set_value('key_note[' . $key->id . ']', $key->note),
                                            'class' => 'txt small',
                                        )); ?></td>
                                    <td><?php echo $key->key . form_hidden('key_key[' . $key->id . ']', $key->key); ?></td>
                                    <td>
                                        <?php echo format_date($key->date_created); ?>
                                    </td>
                                    <td>
                                        <a href="#" class="delete-key"><img src="<?php echo base_url(); ?>third_party/themes/admin/pancake/img/ui_icons/cancel_24.png"/></a>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>

                    <br/>

                    <a href="#" id="add-key" class="blue-btn"><span>Add Another Key</span></a>

                    <br/>
                </div><!--/api keys-->

                <div id="task_statuses">
                    <table class="pc-table" cellspacing="0" style="width: 100%;">
                        <thead>
                            <tr>
                                <th><?php echo __('global:title') ?></th>
                                <th><?php echo __('settings:background_color') ?></th>
                                <th><?php echo __('settings:text_color') ?></th>
                                <th><?php echo __('settings:text_shadow') ?></th>
                                <th><?php echo __('settings:box_shadow') ?></th>
                                <th><?php echo __('global:remove') ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($task_statuses as $status): ?>
                                <tr>
                                    <td><?php echo form_input(array(
                                            'name' => 'statuses[' . $status->id . '][title]',
                                            'value' => set_value('statuses[' . $status->id . '][title]', $status->title),
                                            'class' => 'txt small',
                                        ));
                                        ?></td>

                                    <td><?php
                                        echo form_input(array(
                                            'name' => 'statuses[' . $status->id . '][background_color]',
                                            'value' => set_value('statuses[' . $status->id . '][background_color]', $status->background_color),
                                            'class' => 'txt small',
                                        ));
                                        ?></td>

                                    <td><?php
                                        echo form_input(array(
                                            'name' => 'statuses[' . $status->id . '][font_color]',
                                            'value' => set_value('statuses[' . $status->id . '][font_color]', $status->font_color),
                                            'class' => 'txt small',
                                        ));
                                        ?></td>

                                    <td><?php
                                        echo form_input(array(
                                            'name' => 'statuses[' . $status->id . '][text_shadow]',
                                            'value' => set_value('statuses[' . $status->id . '][text_shadow]', $status->text_shadow),
                                            'class' => 'txt small',
                                        ));
                                        ?></td>

                                    <td><?php
                                        echo form_input(array(
                                            'name' => 'statuses[' . $status->id . '][box_shadow]',
                                            'value' => set_value('statuses[' . $status->id . '][box_shadow]', $status->box_shadow),
                                            'class' => 'txt small',
                                        ));
                                        ?></td>

                                    <td>
                                        <a href="#" class="delete-status"><img src="<?php echo base_url(); ?>third_party/themes/admin/pancake/img/ui_icons/cancel_24.png"/></a>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    <br/>
                    <a href="#" id="add-status" class="blue-btn"><span>Add Another Status</span></a>
                    <br/>
                </div>

                <div id="tickets">
                    <div class="row">
                        <div class="twelve columns">
                            <label for="ticket_status_for_sending_invoice"><?php echo __('settings:ticket_status_for_sending_invoice') ?></label>

                            <p class="settings-explain"><?php echo __('settings:ticket_status_for_sending_invoice_description'); ?></p>
                            <span class="sel-item"><?php echo form_dropdown('ticket_status_for_sending_invoice', $ticket_statuses_dropdown, $settings['ticket_status_for_sending_invoice'], 'id="ticket_status_for_sending_invoice"'); ?></span>
                        </div>
                    </div>
                    <div class="ticket_statuses">
                        <h3><?php echo __('settings:ticket_statuses') ?></h3>
                        <table class="pc-table" cellspacing="0" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th><?php echo __('global:title') ?></th>
                                    <th><?php echo __('settings:background_color') ?></th>
                                    <th><?php echo __('settings:text_color') ?></th>
                                    <th><?php echo __('settings:text_shadow') ?></th>
                                    <th><?php echo __('settings:box_shadow') ?></th>
                                    <th><?php echo __('global:remove') ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($ticket_statuses as $status): ?>
                                    <tr>
                                        <td><?php echo form_input(array(
                                                'name' => 'ticket_statuses[' . $status->id . '][title]',
                                                'value' => set_value('ticket_statuses[' . $status->id . '][title]', $status->title),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td><?php
                                            echo form_input(array(
                                                'name' => 'ticket_statuses[' . $status->id . '][background_color]',
                                                'value' => set_value('ticket_statuses[' . $status->id . '][background_color]', $status->background_color),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td><?php
                                            echo form_input(array(
                                                'name' => 'ticket_statuses[' . $status->id . '][font_color]',
                                                'value' => set_value('ticket_statuses[' . $status->id . '][font_color]', $status->font_color),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td><?php
                                            echo form_input(array(
                                                'name' => 'ticket_statuses[' . $status->id . '][text_shadow]',
                                                'value' => set_value('ticket_statuses[' . $status->id . '][text_shadow]', $status->text_shadow),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td><?php
                                            echo form_input(array(
                                                'name' => 'ticket_statuses[' . $status->id . '][box_shadow]',
                                                'value' => set_value('ticket_statuses[' . $status->id . '][box_shadow]', $status->box_shadow),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td>
                                            <a href="#" class="delete-ticket-status"><img src="<?php echo base_url(); ?>third_party/themes/admin/pancake/img/ui_icons/cancel_24.png"/></a>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                        <a href="#" id="add-ticket-status" class="blue-btn"><span>Add Another Status</span></a>
                    </div>
                    <br/>
                    <br/>

                    <div class="ticket_priorities">
                        <h3><?php echo __('settings:ticket_priorities'); ?></h3>
                        <table class="pc-table" cellspacing="0" style="width: 100%;">
                            <thead>
                                <tr>
                                    <th><?php echo __('global:title') ?></th>
                                    <th><?php echo __('settings:background_color') ?></th>
                                    <th><?php echo __('settings:text_color') ?></th>
                                    <th><?php echo __('settings:text_shadow') ?></th>
                                    <th><?php echo __('settings:box_shadow') ?></th>
                                    <th><?php echo __('settings:default_rate') ?></th>

                                    <th><?php echo __('global:remove') ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($ticket_priorities as $priority): ?>
                                    <tr>
                                        <td><?php echo form_input(array(
                                                'name' => 'ticket_priorities[' . $priority->id . '][title]',
                                                'value' => set_value('ticket_priorities[' . $priority->id . '][title]', $priority->title),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td><?php
                                            echo form_input(array(
                                                'name' => 'ticket_priorities[' . $priority->id . '][background_color]',
                                                'value' => set_value('ticket_priorities[' . $priority->id . '][background_color]', $priority->background_color),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td><?php
                                            echo form_input(array(
                                                'name' => 'ticket_priorities[' . $priority->id . '][font_color]',
                                                'value' => set_value('ticket_priorities[' . $priority->id . '][font_color]', $priority->font_color),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td><?php
                                            echo form_input(array(
                                                'name' => 'ticket_priorities[' . $priority->id . '][text_shadow]',
                                                'value' => set_value('ticket_priorities[' . $priority->id . '][text_shadow]', $priority->text_shadow),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td><?php
                                            echo form_input(array(
                                                'name' => 'ticket_priorities[' . $priority->id . '][box_shadow]',
                                                'value' => set_value('ticket_priorities[' . $priority->id . '][box_shadow]', $priority->box_shadow),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td><?php
                                            echo form_input(array(
                                                'name' => 'ticket_priorities[' . $priority->id . '][default_rate]',
                                                'value' => set_value('ticket_priorities[' . $priority->id . '][default_rate]', $priority->default_rate),
                                                'class' => 'txt small',
                                            ));
                                            ?></td>

                                        <td>
                                            <a href="#" class="delete-ticket-priority"><img src="<?php echo base_url(); ?>third_party/themes/admin/pancake/img/ui_icons/cancel_24.png"/></a>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                        <a href="#" id="add-ticket-priority" class="blue-btn"><span>Add Another Priority</span></a>
                    </div>
                    <br/>
                </div>

            </div><!-- /tabbed-content-->

            <input type="submit" class="hidden-submit"/>
        </div><!-- /tabs-row-->
    </div>
</div><!-- /row-->

<?php echo form_close(); ?>

<script type="text/javascript">
    $(document).ready(function () {

        $('#frontend_css, #backend_css').each(function () {
            $(this).data('codemirror', CodeMirror.fromTextArea(this, {
                lineNumbers: true,
                mode: "css",
                matchBrackets: true
            }));
        });

        $('#frontend_js, #backend_js').each(function () {
            $(this).data('codemirror', CodeMirror.fromTextArea(this, {
                lineNumbers: true,
                mode: "javascript",
                matchBrackets: true
            }));
        });

        $('form').on('submit', function () {
            if ($(this).attr('action').indexOf("/import") >= 0) {
                $(this).find(".blue-btn.import-btn").text(__('update:loadingpleasewait'));
            } else if ($(this).attr('action').indexOf("/export") === -1) {
                $(this).find(".side-bar-wrapper .blue-btn span").text(__('update:loadingpleasewait'));
            }
        });

        $('.smtp, .gapps, .gmail, .sendmail, .secure_smtp, .tls_smtp').hide();
        $('.' + $('[name=email_server]').val()).show();

        $('[name=email_server]').change(function () {
            if ($('.smtp:visible, .secure_smtp:visible, .tls_smtp:visible, .gapps:visible, .gmail:visible, .sendmail:visible').length > 0) {
                $('.smtp:visible, .secure_smtp:visible, .tls_smtp:visible, .gapps:visible, .gmail:visible, .sendmail:visible').slideUp(function () {
                    $('.' + $('[name=email_server]').val()).slideDown();
                });
            } else {
                $('.' + $('[name=email_server]').val()).slideDown();
            }

        });

        $('.form_error').parent().find('input').addClass('error');



        $('#add-tax').click(function () {
            var $tbody = $(this).parent().children('table').children('tbody');

            $tbody.append('<tr><td><?php echo form_input(array(
				'name' => 'new_tax_name[{NUMBER}]',
				'class' => 'txt small',
			)); ?></td><td><?php echo form_input(array(
				'name' => 'new_tax_value[{NUMBER}]',
				'class' => 'txt small',
			)); ?></td><td><?php echo form_input(array(
				'name' => 'new_tax_reg[{NUMBER}]',
				'class' => 'txt small',
			)); ?></td><td class="checkbox-td"><input type="checkbox" name="new_tax_compound[{NUMBER}]" value="1"></td></tr>'.split('{NUMBER}').join($tbody.find("tr").length + 1));

            return false;
        });

        $('#add-status').click(function () {
            $(this).parent().children('table').children('tbody').append('<tr><td><?php
                    echo form_input(array(
                        'name' => 'new_statuses[title][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_statuses[background_color][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_statuses[font_color][]',
                        'class' => 'txt small',
                    ));
					?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_statuses[text_shadow][]',
                        'class' => 'txt small',
                    ));
					?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_statuses[box_shadow][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><a href="#" class="delete-status"><img src="<?php echo base_url(); ?>third_party/themes/admin/pancake/img/ui_icons/cancel_24.png" /></a></td></tr>');

            return false;
        });

        $('#add-ticket-status').click(function () {
            $(this).parent().children('table').children('tbody').append('<tr><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_statuses[title][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_statuses[background_color][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_statuses[font_color][]',
                        'class' => 'txt small',
                    ));
					?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_statuses[text_shadow][]',
                        'class' => 'txt small',
                    ));
					?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_statuses[box_shadow][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><a href="#" class="delete-ticket-status"><img src="<?php echo base_url(); ?>third_party/themes/admin/pancake/img/ui_icons/cancel_24.png" /></a></td></tr>');

            return false;
        });

        $('#add-ticket-priority').click(function () {
            $(this).parent().children('table').children('tbody').append('<tr><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_priorities[title][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_priorities[background_color][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_priorities[font_color][]',
                        'class' => 'txt small',
                    ));
					?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_priorities[text_shadow][]',
                        'class' => 'txt small',
                    ));
					?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_priorities[box_shadow][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><?php
                    echo form_input(array(
                        'name' => 'new_ticket_priorities[default_rate][]',
                        'class' => 'txt small',
                    ));
                    ?></td><td><a href="#" class="delete-ticket-priority"><img src="<?php echo base_url(); ?>third_party/themes/admin/pancake/img/ui_icons/cancel_24.png" /></a></td></tr>');
            return false;
        });

        $('#add-currency').click(function () {
            $(this).parent().children('table').children('tbody').append('<tr><td><?php echo form_input(array(
			'name' => 'new_currency_name[]',
			'class' => 'txt small',
		)); ?></td><td><?php echo form_input(array(
			'name' => 'new_currency_code[]',
			'class' => 'txt small currency_code',
		)); ?></td><td><span class="sel-item"><?php echo str_ireplace("\n", "", form_dropdown('new_currency_format[]', currency_formats(), array(), 'class="js-currency-format"')); ?> </span></td><td><?php echo form_input(array(
			'name' => 'new_currency_rate[]',
			'class' => 'txt small currency_rate',
			'style' => 'width: 78px; float: left;',
		)); ?><span style="float:left;margin-top: 8px;margin-left: 6px;"> = <span class="js-currency-symbol"><?php echo Currency::symbol()?></span>1</span></td></tr>');

            return false;
        });

        $('#add-key').click(function () {

            key = random_string(40);

            $(this).parent().children('table').children('tbody').append('<tr><td><?php echo form_input(array(
			'name' => 'new_key_note[]',
			'value' => '',
			'class' => 'txt small',
		)); ?></td>'
                + '<td>' + key + '<input type="hidden" name="new_key[]" value="' + key + '" /></td>'
                + '<td><?php echo format_date(now()); ?></td>'
                + '<td>'
                + '	<a class="delete-key" href="#">'
                + '		<img src="<?php echo base_url(); ?>third_party/themes/admin/pancake/img/ui_icons/cancel_24.png">'
                + '	</a>'
                + '</td>'
                + '</tr>');

            return false;
        });

        $('.delete-key').live('click', function () {
            $(this).closest('tr').fadeOut().find('input').val('');
            return false;
        });

        $('.delete-status').live('click', function () {
            $(this).closest('tr').fadeOut().remove();
            return false;
        });

        $('.delete-ticket-status').live('click', function () {
            $(this).closest('tr').fadeOut().remove();
            return false;
        });

        $('.delete-ticket-priority').live('click', function () {
            $(this).closest('tr').fadeOut().remove();
            return false;
        });

        $('input.currency_code').live('keyup', function () {
            var rate = $(this).closest('tr').find('input.currency_rate');

            if (rate.val() == "") {
                $.get('<?php echo base_url(); ?>ajax/convert_currency/' + this.value, function (amount) {

                    if (parseFloat(amount) > 0) {
                        rate.val(Math.round(amount * 100000) / 100000);
                    }
                });
            }
        });

        $('#rss_type').change(function () {
            update_rss_link();
        });

        $('#rss_items').keyup(function () {
            update_rss_link();
        });

        function send_test_email(event) {
            var $el = $(this);
            event.preventDefault();

            if ($el.is(".disabled")) {
                return;
            }

            $el.removeClass("success").addClass("disabled").html(__("settings:sending"));
            var href = $el.attr("href");

            var fields = <?php echo json_encode($email_inputs); ?>;
            var data = {};
            $.each(fields, function (key, value) {
                data[value] = $('[name="' + value + '"]').val();
            });

            $.post(href, data, function (data) {
                $el.removeClass("disabled").html(__("settings:send_test_email"));
                if (data.success) {
                    $el.addClass("success").html(__("settings:test_email_sent").replace(":1", data.to));
                } else {
                    open_reveal("<div class='test-email-error'><h3>" + __("settings:test_email_error_header") + "</h3><p>" + data.error + "</p></div>");
                }
            }, 'json').fail(function () {
                $el.removeClass("disabled").html(__("settings:send_test_email"));
                open_reveal("<div class='test-email-error'><h3>" + __("settings:test_email_error_header") + "</h3><p>" + __("error:subtitle") + "</p></div>");
            });
        }

        $('body').on("click", ".js-send-test-email", send_test_email);

        function update_rss_link() {
            var type = $('#rss_type').val();
            var items = $('#rss_items').val();
            var password = $('#rss_password').val();

            var link = '<?php echo site_url('feeds'); ?>/' + type + '/' + items + '/' + password

            $('#rss_link_gen').html('<a href="' + link + '">' + link + '</a>');
        }

        update_rss_link();

        function random_string(string_length) {
            var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
            var randomstring = '';
            for (var i = 0; i < string_length; i++) {
                var rnum = Math.floor(Math.random() * chars.length);
                randomstring += chars.substring(rnum, rnum + 1);
            }
            return randomstring;
        }
    });

    <?php

     $currencies_symbols = array();
     $this->config->load('currency');
     $currencies_config = $this->config->item('currencies');
     foreach ($currencies_config as $code => $currency) {
         $currencies_symbols[$code] = $currency['symbol'];
     }

     ?>

    var currencies_symbols = <?php echo json_encode($currencies_symbols); ?>;
    var current_symbol = "<?php echo Currency::symbol(); ?>";
    var update_currency_format_symbols = function () {
        var symbol = $(this).data('symbol'), val = $(this).val().toUpperCase(), new_symbol;

        if (!symbol) {
            $(this).data('symbol', "<?php echo Currency::symbol(); ?>");
            symbol = "<?php echo Currency::symbol(); ?>";
        }

        new_symbol = (typeof(currencies_symbols[val]) == "undefined") ? "$" : currencies_symbols[val];

        // Fixes an issue with the £/&pound; difference.
        new_symbol = $('<div>' + new_symbol + '</div>').html();

        if (symbol != new_symbol) {
            $(this).parents('tr').find('option').each(function () {
                $(this).html($(this).html().split(symbol).join(new_symbol));
            });

            $(this).data('symbol', new_symbol);
        }
    };

    $('[name="currency"]').on("change", function () {
        var val = $(this).val().toUpperCase();
        current_symbol = (typeof(currencies_symbols[val]) == "undefined") ? "$" : currencies_symbols[val];

        $(".js-currency-symbol").html(current_symbol);
    });

    $('#currencies').find('.pc-table').on("input", '[name*="currency_code"]', update_currency_format_symbols);
    $('#currencies').find('[name*="currency_code"]').each(update_currency_format_symbols);

</script>
</div><!--/ten columns-->

