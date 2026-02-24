<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo lang('clients:' . $action_type); ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>

<div class="row">
    <div class="nine columns connine endt-wrapper content-wrapper">
        <div id="ajax_container"></div>

        <div class="form-holder"  style="margin-top:2em">
            <?php echo form_open('admin/clients/' . $action, 'id="client-mod"'); ?>
            <fieldset class="add_client">

                <div id="invoice-type-block"

                     <div class="row">
                        <div class="three columns">
                            <label for="title"><?php echo lang('global:title') ?></label>
                        </div>
                        <div class="three columns end">
                            <?php echo form_input('title', set_value('title'), 'id="title" class="txt short right"'); ?>
                        </div>
                    </div>

                    <div class="row">
                        <div class="three columns">
                            <label for="first_name"><?php echo lang('global:first_name') ?></label>
                        </div>

                        <div class="nine columns end">
                            <?php echo form_input('first_name', set_value('first_name'), 'id="first_name" class="txt"'); ?>
                        </div>
                    </div>

                    <div class="row">
                        <div class="three columns">
                            <label for="last_name"><?php echo lang('global:last_name') ?></label>
                        </div>

                        <div class="nine columns end">
                            <?php echo form_input('last_name', set_value('last_name'), 'id="last_name" class="txt"'); ?>
                        </div>
                    </div>

                    <div class="row">
                        <div class="three columns">
                            <label for="company"><?php echo lang('global:company') ?></label>
                        </div>

                        <div class="nine columns end">
                            <?php echo form_input('company', set_value('company'), 'id="company" class="txt"'); ?>
                        </div>
                    </div>

                    <div class="row">
                        <div class="three columns">
                            <label for="address"><?php echo lang('global:address') ?></label>
                        </div>

                        <div class="nine end columns">
                            <?php
                            echo form_textarea(array(
                                'name' => 'address',
                                'id' => 'address',
                                'value' => set_value('address'),
                                'rows' => 3,
                                'cols' => 30
                            ));
                            ?>
                        </div>
                    </div>

                    <div class="row">
                        <div class="three columns"><label for="email"><?php echo lang('global:email') ?></label></div>
                        <div class="nine end columns"><?php echo form_input('email', set_value('email'), 'id="email" class="txt"'); ?></div>
                    </div>

                    <div class="row">
                        <div class="three columns"><label for="website"><?php echo lang('global:website') ?></label></div>
                        <div class="nine end columns"><?php echo form_input('website', set_value('website'), 'id="website" class="txt"'); ?></div>
                    </div>

                    <div class="row">
                        <div class="three columns"><label for="phone"><?php echo lang('global:phone') ?></label></div>
                        <div class="nine end columns"><?php echo form_input('phone', set_value('phone'), 'id="phone" class="txt"'); ?></div>
                    </div>

                    <div class="row">
                        <div class="three columns"><label for="mobile"><?php echo lang('global:mobile') ?></label></div>
                        <div class="nine end columns"><?php echo form_input('mobile', set_value('mobile'), 'id="mobile" class="txt"'); ?></div>
                    </div>

                    <div class="row">
                        <div class="three columns"><label for="fax"><?php echo lang('global:fax') ?></label></div>
                        <div class="nine end columns"><?php echo form_input('fax', set_value('fax'), 'id="fax" class="txt"'); ?></div>
                    </div>

                    <div class="row">
                        <div class="three columns"><label for="language"><?php echo __('settings:language') ?></label></div>
                        <div class="nine end columns">
                            <div class="sel-item dropdown-arrow">
                                <?php echo form_dropdown('language', $languages, set_value('language', Settings::get("language")), 'id="language"') ?>
                            </div></div>
                    </div>

                <div class="row">
                    <div class="three columns"><label for="business_identity"><?php echo __('settings:business_identity') ?></label></div>
                    <div class="nine end columns">
                        <div class="sel-item short-bottom-margin dropdown-arrow">
                            <?php echo form_dropdown('business_identity', $businesses, set_value('business_identity'), 'id="business_identity"') ?>
                        </div>
                        <p class="settings-explain"><?php echo __("settings:business_identity_explanation"); ?></p>
                    </div>
                </div>

                <div class="row">
                    <div class="three columns">
                        <label for="default_currency_code">
                            <?php echo __("clients:default_currency") ?>
                        </label>
                    </div>
                    <div class="nine end columns">
                        <div class="sel-item short-bottom-margin dropdown-arrow">
                            <?php echo form_dropdown("default_currency_code", $currencies, set_value('default_currency_code'), 'id="default_currency_code"') ?>
                        </div>
                        <p class="settings-explain"><?php echo __("clients:default_currency_explanation"); ?></p>
                    </div>
                </div>

                <div class="row">
                    <div class="three columns">
                        <label for="default_tax_id">
                            <?php echo __("settings:default_taxes"); ?>
                        </label>
                    </div>
                    <div class="nine end columns">
                        <div class="sel-item short-bottom-margin dropdown-arrow">
                            <select id="default_tax_id" name="default_tax_id[]" multiple="multiple" class="multiselect" data-nothing-selected-label="<?php echo __("settings:no_tax"); ?>">
                                <?php foreach (Settings::all_taxes() as $id => $tax): ?>
                                    <option value="<?php echo $id; ?>" <?php echo (in_array($id, $default_tax_ids)) ? 'selected="selected"' : ''; ?>><?php echo $tax['name']; ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <p class="settings-explain"><?php echo __("clients:default_currency_explanation"); ?></p>
                    </div>
                </div>

                <div class="row">
                    <div class="twelve columns">
                        <label for="default_tax_id"></label>

                    </div>
                </div>

                    <div class="row">
                        <div class="three columns"><label for="profile"><?php echo lang('global:notes') ?></label></div>
                        <div class="nine end columns">
                            <?php
                            echo form_textarea(array(
                                'name' => 'profile',
                                'id' => 'profile',
                                'value' => set_value('profile'),
                                'rows' => 6,
                                'cols' => 60
                            ));
                            ?>
                        </div>
                    </div>

                    <div class="row form-holder">
                        <div class="three columns"><label for="support_user_id"><?php echo lang('clients:support') ?></label></div>
                        <div class="three columns">
                            <div class="sel-item dropdown-arrow">
                                <select id="support_user_id" name="support_user_id">
                                    <option value=""/><?php echo __("tickets:disable_client"); ?>
                                    <?php foreach ($users as $user): ?>
                                        <option value="<?php echo $user['id']; ?>" <?php echo $user['id'] == set_value('support_user_id') ? 'selected' : '' ?>><?php echo $user['first_name'] . ' ' . $user['last_name'] ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>

                        <div class="one columns"></div>

                        <div class="five columns">
                            <?php if (isset($client_id)): ?>
                                <a href="<?php echo site_url('admin/clients/support_matrix_form/' . $client_id) ?>" class="blue-btn support-rates fire-ajax" ><span><?php echo lang('clients:support_rates') ?></span></a>
                            <?php endif; ?>
                        </div>

                        <div class="one columns"></div>

                    </div>
                    <div class="row form-holder">
                        <label class="nine columns offset-by-three" style="font-weight: normal;">
                            <input type="checkbox" name="can_create_support_tickets" value="1" <?php echo set_checkbox("can_create_support_tickets", "1"); ?> > <?php echo __("clients:can_create_support_tickets"); ?>
                        </label>
                    </div>

                    <?php assignments('clients', stristr($action, 'edit/') !== false ? str_ireplace('edit/', '', $action) : 0, "three"); ?>

                    <!--                     <div class="row">
                                            <div class="three columns"><label for="email-client">Email Client</label></div>
                                            <div class="nine end columns"><input type="checkbox" name="email_client" />
                                                <span class="note">email the client with url and passphrase</span>
                                            </div>
                                        </div>
                    -->
                    <div class="row">
                        <div class="three columns"><label for="email-client">Random Passphrase</label></div>
                        <div class="eight end columns"><input type="checkbox" name="random_passphrase" id="random_passphrase" />
                        </div>
                    </div>

                    <div class="row">
                        <div class="three columns"><label for="passphrase">Passphrase</label></div>
                        <div class="nine end columns"><?php echo form_input('passphrase', set_value('passphrase'), 'id="passphrase" class="txt"'); ?>
                        </div>
                    </div>
	            <div class="row form-holder">
		            <label class="nine columns offset-by-three" style="font-weight: normal;">
			            <input type="checkbox" name="can_view_invoices_without_passphrase" value="1" <?php echo set_checkbox("can_view_invoices_without_passphrase", "1"); ?> > <?php echo __("clients:can_view_invoices_without_passphrase"); ?>
		            </label>
	            </div>

                    <div class="row" style="margin-top: 2em;">
                        <div class="twelve columns"><h4><?php echo __('clients:tax_numbers'); ?></h4></div>
                    </div>

                    <?php foreach (Settings::all_taxes() as $tax_id => $tax): ?>
                        <div class="row">
                            <div class="three columns"><label for="tax_<?php echo $tax_id; ?>"><?php echo __("clients:tax_registration_number", array($tax['name'])); ?></label></div>
                            <div class="nine end columns"><?php echo form_input('tax[' . $tax_id . ']', set_value('tax[' . $tax_id . ']', isset($client_taxes[$tax_id]) ? $client_taxes[$tax_id] : ""), 'id="tax_' . $tax_id . '" class="txt"'); ?></div>
                        </div>
                    <?php endforeach; ?>

                    <div class="row">
                        <div class="twelve columns"><h4><?php echo __("clients:custom_fields") ?></h4></div>
                    </div>
                    <div class="js-custom-fields-container">
                        <?php if (isset($_REQUEST['custom'])): ?>
                            <?php foreach ($_REQUEST['custom']['label'] as $slug => $label): ?>
                                <?php if (trim($label) == ""): ?>
                                    <?php continue; ?>
                                <?php endif; ?>

                                <?php $value = $_REQUEST['custom']['value'][$slug];?>
                                <div class="row">
                                    <div class="three columns">
                                        <?php echo form_input('custom[label][' . $slug . ']', $label); ?>
                                    </div>
                                    <div class="nine end columns">
                                        <?php echo form_input('custom[value][' . $slug . ']', $value); ?>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <?php foreach ($custom_fields as $custom_field): ?>
                                <div class="row">
                                    <div class="three columns">
                                        <?php echo form_input('custom[label][' . $custom_field['slug'] . ']', $custom_field['label']); ?>
                                    </div>
                                    <div class="nine end columns">
                                        <?php echo form_input('custom[value][' . $custom_field['slug'] . ']', $custom_field['value']); ?>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                        <div class="row js-new-custom-field js-new-custom-field-container">
                            <div class="three columns">
                                <?php echo form_input('custom[label][]', ""); ?>
                            </div>
                            <div class="eight columns">
                                <?php echo form_input('custom[value][]', ""); ?>
                            </div>
                            <div class="one end columns trash-buttons">
                                <a href="#" class="blue-btn js-remove-field" ><span><i class="fi fi-trash"></i></span></a>
                            </div>
                        </div>
                    </div>
                    <div class="row" style="margin-bottom: 4em;">
                        <div class="nine columns offset-by-three">
                            <a href="#" class="blue-btn js-add-custom-field" ><span><?php echo __("clients:add_custom_field") ?></span></a>
                        </div>
                    </div>


                    <div class="row">
                        <div class="nine offset-by-three columns"> <a href="#" class="blue-btn js-fake-submit-button"><span><?php echo lang('global:save'); ?>&rarr;</span></a></div>
                    </div>

                </div><!-- /row -->

            </fieldset>

            <input type="submit" class="hidden-submit" />

            <?php echo form_close(); ?>
        </div><!-- /form holder-->
    </div><!-- /9 cols -->

    <div class="three columns side-bar-wrapper">
        <div class="panel">

        </div>
    </div>
</div><!-- /row -->

<script type="text/javascript">
    $(document).ready(function () {
        $('#random_passphrase').click(function () {
            if ($(this).attr('checked') == 'checked') {
                $('#passphrase').attr('disabled', true);
            } else {
                $('#passphrase').removeAttr('disabled');
            }
        });
    });
</script>
