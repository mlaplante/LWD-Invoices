<script>
    is_editing_invoice = <?php echo $is_edit ? "true" : "false"?>;
    has_submitted_data = <?php echo count($_POST) ? "true" : "false"?>;
</script>
<script src="<?php echo site_url("admin/invoices/form_js/$unique_id?time=" . time()); ?>"></script>
<div id="header">
    <div class="row">
        <h2 class="ttl ttl3">
            <?php if ($type == "CREDIT_NOTE"): ?>
                <?php if ($is_edit): ?>
                    <?php echo __('credit_notes:edit_credit_note', array($invoice->invoice_number)) ?>
                <?php else: ?>
                    <?php echo __('credit_notes:create_credit_note'); ?>
                <?php endif; ?>
            <?php elseif ($type == "ESTIMATE"): ?>
                <?php if ($is_edit): ?>
                    <?php echo __('estimates:editestimate', array($invoice->invoice_number)) ?>
                <?php else: ?>
                    <?php echo __('estimates:createnew'); ?>
                <?php endif; ?>
            <?php else: ?>
                <?php if ($is_edit): ?>
                    <?php echo __('invoices:editinvoice', array($invoice->invoice_number)) ?>
                <?php else: ?>
                    <?php echo __('invoices:newinvoice'); ?>
                <?php endif; ?>
            <?php endif; ?>
        </h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>
<div class="row">
    <?php if (!isset($iframe) or !$iframe) : ?><?php endif; ?>
    <?php echo form_open_multipart('admin/' . $this->template->module . '/' . ($is_edit ? "edit/{$invoice->unique_id}" : ('create/' . ((!isset($iframe) or !$iframe) ? '' : 'iframe'))), 'id="create-invoice" class="js-invoice-form"'); ?>
    <input type="hidden" name="unique_id" value="<?php echo $unique_id; ?>">

    <div class="three columns push-nine side-bar-wrapper">
        <div class="panel form-holder">
            <?php if (!isset($iframe) or !$iframe): ?>
                <div class="row">
                    <label for="lb06"><?php echo __("global:client"); ?></label>

                    <div class="sel-item dropdown-arrow">
                        <?php echo form_dropdown('client_id', $clients_dropdown, set_value('client_id', isset($client_id) ? $client_id : (isset($project) ? (int) $project->client_id : '')), 'id="client"'); ?>
                    </div>
                    <?php if (is_admin()): ?>
                        <div style="margin-bottom: 16px;">
                            <a href="<?php echo site_url('admin/clients/create'); ?>" title="<?php echo __('clients:add'); ?>" class="blue-btn"><span><?php echo __('clients:add'); ?></span></a>
                        </div>
                    <?php endif; ?>
                </div><!-- /row end -->
                <div class="row">
                    <label for="lb06">Project</label>

                    <div class="sel-item dropdown-arrow">
                        <?php $project_id = $is_edit ? $invoice->project_id : (isset($project) ? (int) $project->id : 0); ?>
                        <select name="project_id" id='project_id' data-original-edit-value="<?php echo $project_id ?>">
                            <option value=""><?php echo __("invoices:not_associated_with_a_project"); ?></option>
                            <?php foreach ($projects as $project_dropdown_item): ?>
                                <option value="<?php echo $project_dropdown_item->id ?>" <?php echo set_select('project_id', $project_dropdown_item->id, $project_dropdown_item->id == $project_id) ?>><?php echo $project_dropdown_item->name ?></option>
                            <?php endforeach ?>
                        </select>
                    </div>
                </div><!-- /row end -->
            <?php else: ?>
                <input type="hidden" name="client_id" value="<?php echo(isset($client_id) ? $client_id : ''); ?>">
            <?php endif; ?>
            <input type='hidden' name='type' value='<?php echo $type; ?>'/>

            <div class="row">
                <label for="invoice_number"><?php echo __('invoices:number'); ?></label>
                <?php echo form_input('invoice_number', set_value('invoice_number', isset($invoice_number) ? $invoice_number : ''), 'id="invoice_number" class="txt"'); ?>
            </div>

            <div class="row">
                <label for="date_entered"><?php echo __('invoices:date_entered'); ?></label>
                <?php echo form_input('date_entered', set_value('date_entered', format_date($is_edit ? $invoice->date_entered : time())), 'id="date_entered" class="text txt datePicker"'); ?>
            </div>

            <div class="row">
                <label for="currency"><?php echo __('settings:currency'); ?></label>

                <div class="dropdown-arrow">
                    <select id="currency" name="currency">
                        <?php foreach ($currencies as $code => $currency) : ?>
                            <?php
                            $selected = false;

                            if ($is_edit && $invoice->currency_code == $code) {
                                $selected = true;
                            } elseif (isset($project) and $project->currency_code == $code) {
                                $selected = true;
                            } elseif ($code == '0') {
                                $selected = true;
                            }

                            ?>
                            <option value="<?php echo $code; ?>" data-symbol="<?php echo Currency::symbol($code); ?>" <?php echo set_select('currency', $code, $selected); ?>><?php echo $currency; ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>

            <div class="row">
                <label for="is_recurring"><?php echo __('invoices:is_viewable') ?></label>

                <p><?php echo __('invoices:pancake_will_automatically_change_is_viewable'); ?></p>

                <div class="dropdown-arrow">
                    <?php echo form_dropdown('is_viewable', array(__('global:no'), __('global:yes')), set_value('is_viewable', $is_edit ? $invoice->is_viewable : 0), 'id="is_viewable"'); ?>
                </div>
            </div>

            <?php if ($type == "DETAILED"): ?>
                <div class="row">
                    <label for="auto_send"><?php echo __("invoices:auto_send"); ?></label>

                    <div class="dropdown-arrow">
                        <?php echo form_dropdown('auto_send', array(__('global:no'), __('global:yes')), set_value('auto_send', $is_edit ? $invoice->auto_send : Settings::get("always_autosend")), 'id="auto_send"'); ?>
                    </div>

                    <div class="js-send-x-days-before">
                        <p class="description"><?php echo __('global:auto_send_needs_pancake_cron_job') ?></p>

                        <label for="send_x_days_before"><?php echo __('invoices:send'); ?></label>
                        <?php echo form_input('send_x_days_before', set_value('send_x_days_before', $is_edit ? $invoice->send_x_days_before : Settings::get('send_x_days_before')), 'id="send_x_days_before" class="text txt"'); ?>
                        <label class="send_x_days_before_label"><?php echo __('invoices:days_before_invoice_is_due'); ?></label>
                    </div>
                </div>

                <?php if (!$is_edit or (!$invoice->is_recurring or ($invoice->recur_id == $invoice->id))) : ?>
                    <div class="row hide-estimate hide-credit-note">
                        <label for="is_recurring"><?php echo __('invoices:is_recurring') ?></label>

                        <div class="dropdown-arrow">
                            <?php echo form_dropdown('is_recurring', array(__('global:no'), __('global:yes')), set_value('is_recurring', $is_edit ? $invoice->is_recurring : ''), 'id="is_recurring"'); ?>
                        </div>
                    </div>

                    <div id="recurring-options" style="display:none">
                        <p class="description"><?php echo __('global:you_need_pancake_cron_job') ?></p>

                        <label for="frequency"><?php echo __('invoices:frequency'); ?></label>

                        <div class="dropdown-arrow">
                            <?php echo form_dropdown('frequency', get_recurring_frequencies_labels(), set_value('frequency', $is_edit ? $invoice->frequency : 'm'), 'id="frequency"'); ?>
                        </div>
                    </div>
                <?php else: ?>
                    <div class="row">
                        <label><?php echo __('invoices:is_recurring') ?></label>
                        <label class="cannot_change_recurrence_settings"><?php echo __('invoices:cannot_change_recurrences'); ?></label>
                    </div>
                <?php endif; ?>


                <div class="row">
                    <label for="auto_charge"><?php echo __("invoices:charge_when_due"); ?></label>

                    <div class="js-has-auto-charge">
                        <p><?php echo __('invoices:pancake_will_charge_when_invoice_is_due'); ?></p>

                        <div class="dropdown-arrow">
                            <?php echo form_dropdown('auto_charge', array(__('global:no'), __('global:yes')), set_value('auto_charge', $is_edit ? $invoice->auto_charge : 0), 'id="auto_charge"'); ?>
                        </div>

                        <div class="js-auto-charge">
                            <p class="description"><?php echo __('invoices:auto_charge_needs_pancake_cron_job') ?></p>
                        </div>
                    </div>
                    <div class="js-not-has-auto-charge">
                        <p><?php echo __('invoices:pancake_cannot_auto_charge'); ?></p>
                    </div>
                </div>
            <?php endif; ?>

            <input type="hidden" name="due_date" value="0"/>

        </div>
        <!-- /panel -->
    </div>
    <!-- /three columns side-bar-wrapper -->

    <div class="nine columns pull-three content-wrapper">
        <div class="form-holder">
            <fieldset>
                <?php if (!isset($iframe) or !$iframe) : ?>
                    <div class="row">
                        <label for="description"><?php echo __('invoice:description') ?></label>
                        <?php
                        echo form_textarea(array(
                            'name' => 'description',
                            'id' => 'description',
                            'value' => set_value('description', $is_edit ? $invoice->description : (isset($project) ? $project->description : '')),
                            'rows' => 4,
                            'cols' => 50,
                        ));
                        ?>
                    </div><!-- /row end -->
                <?php else: ?>
                    <input type="hidden" name="description" value="">
                <?php endif; ?>

                <!-- item list -->
                <div id="DETAILED-wrapper" class="type-wrapper row">
                    <label for="nothing"><?php echo __('items:line_items') ?></label>
                    <table id="invoice-items">
                        <thead>
                            <tr>
                                <th class="name-head"><?php echo __('items:name') ?></th>
                                <th class="qty-head"><?php echo __('items:qty_hrs') ?></th>
                                <th class="amount-head"><?php echo __('items:rate') ?></th>
                                <th class="tax-head"><?php echo __('items:tax_rate') ?></th>
                                <th class="type-head"><?php echo __('items:type') ?></th>
                                <th class="discount-head"><?php echo __('invoices:discount') ?></th>
                                <th class="cost-head"><?php echo __('items:cost') ?></th>
                                <th class="actions-head"><?php echo __('global:actions') ?></th>
                            </tr>
                        </thead>
                        <tfoot>
                            <tr>
                                <td class="name-head" colspan="8">
                                    <div class="difference">
                                        <?php echo __('reports:total_amount') ?>:
                                        <span class="symbol"><?php echo Currency::symbol(); ?></span><span class="value"></span>
                                    </div>
                                </td>
                            </tr>
                        </tfoot>
                        <tbody class="make-it-sortable">
                            <?php foreach ($items as $item): ?>
                                <tr class="parent-line-item-table-row">
                                    <td colspan="8" class="parent-line-item-table-cell">
                                        <table class="sub-invoice-table">
                                            <tr class="details">
                                                <td class="name-row">
                                                    <input type="text" class="item_name" name="invoice_item[name][]" data-item-type='<?php echo isset($item['type']) ? $item['type'] : 'standard'; ?>' value="<?php echo form_prep($item['name']); ?>"/>
                                                </td>
                                                <td class="qty-row">
                                                    <input type="text" name="invoice_item[qty][]" class="item_quantity" value="<?php echo $item['qty']; ?>"/>
                                                </td>
                                                <td class="amount-row">
                                                    <input type="text" name="invoice_item[rate][]" class="item_rate" value="<?php echo $item['rate']; ?>"/>
                                                </td>
                                                <td class="tax-row tax-dropdown">
                                                    <select id="invoice_item_tax_ids" name="invoice_item[tax_id][][]" multiple="multiple" class="multiselect" data-nothing-selected-label="<?php echo __("settings:no_tax"); ?>">
                                                        <?php $default_tax_ids = isset($item['tax_ids']) ? $item['tax_ids'] : Settings::get_default_tax_ids(); ?>
                                                        <?php foreach (Settings::all_taxes() as $id => $tax): ?>
                                                            <option value="<?php echo $id; ?>" <?php echo (in_array($id, $default_tax_ids)) ? 'selected="selected"' : ''; ?>><?php echo $tax['name']; ?></option>
                                                        <?php endforeach; ?>
                                                    </select>
                                                </td>
                                                <?php $current_item_time_entries = (isset($item['item_time_entries']) ? $item['item_time_entries'] : ((isset($item['id']) and isset($item_time_entries[$item['id']])) ? $item_time_entries[$item['id']] : '')); ?>
                                                <td class="type-row">
                                                    <input type="hidden" class='item_time_entries' name="invoice_item[item_time_entries][]" value="<?php echo $current_item_time_entries; ?>">
                                                    <input type="hidden" class='item_type_id' name="invoice_item[item_type_id][]" value="<?php echo invoice_item_type_id($item); ?>">
                                                    <span class="dropdown-arrow"><?php echo form_dropdown('invoice_item[type][]', Item_m::type_dropdown(), isset($item['type']) ? $item['type'] : 'standard', 'class="js-invoice-item-type"'); ?></span>
                                                </td>
                                                <td class="discount-row">
                                                    <input type="text" name="invoice_item[discount][]" class="item_discount" value="<?php echo $item['discount'] + 0; ?><?php echo $item['discount_is_percentage'] ? "%" : ""; ?>"/>
                                                </td>
                                                <td class="cost-row">
                                                    <input type="hidden" name="invoice_item[total][]" class="item_cost" value="<?php echo number_format($item['total'], 2); ?>"/>
                                                    <span class="item_cost"><?php echo number_format($item['total'], 2); ?></span>

                                                    <?php
                                                    if (!empty($item['entries'])):
                                                        foreach ($item['entries'] as $entry):
                                                            echo form_hidden('entries[][]', $entry->id);
                                                        endforeach;
                                                    endif;
                                                    ?>
                                                </td>
                                                <td class="actions-row">
                                                    <a href="javascript:void(0)" class="icon sort" style="margin:0; cursor:move;" title="<?php echo __('global:sort') ?>"><?php echo __('global:sort') ?></a>
                                                    <a href="javascript:void(0)" class="icon delete" style="margin:0;"><?php echo __('global:remove') ?></a>
                                                </td>
                                            </tr>
                                            <tr class="description">
                                                <td colspan="8">
                                                    <div class="period-container">
                                                        <input type="text" name="invoice_item[period][]" class="item_period" value="<?php echo process_number($item['period']); ?>"/>
                                                        <span class="js-period-label">days</span>
                                                    </div>


                                                    <textarea name="invoice_item[description][]" rows="2" class="item_description" placeholder="Description"><?php echo $item['description']; ?></textarea>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>

                    <a class="blue-btn" href="#" id="add-row"><span><?php echo __('items:add') ?></span></a> <br/><br/>
                </div>
                <!-- /row end -->

                <?php if (!isset($iframe) or !$iframe) : ?>
                    <div class="row">
                        <label for="lb08"><?php echo __('global:notes') ?></label>

                        <div class="textarea">
                            <?php
                            echo form_textarea(array(
                                'name' => 'notes',
                                'id' => 'notes',
                                'value' => set_value('notes', $is_edit ? $invoice->notes : ""),
                                'rows' => 4,
                                'cols' => 50,
                            ));
                            ?>
                        </div>
                    </div><!-- /row end -->

                <?php else: ?>
                    <input type="hidden" name="notes" value="">
                <?php endif; ?>

                <div class="row hide-estimate hide-credit-note">
                    <label for="nothing"><?php echo __('invoices:files'); ?></label>
                    <table class="pc-table" style="width: 100%">
                        <thead>
                            <tr>
                                <th><?php echo __('invoices:file_name'); ?></th>
                                <th><?php echo __('global:remove'); ?>?</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($files as $file): ?>
                                <tr>
                                    <td style="width: 100%;">
                                        <a href="<?php echo Pancake\Filesystem\Filesystem::url($file['real_filename']); ?>" target="_blank"><?php echo $file['orig_filename']; ?></a>
                                    </td>
                                    <td style="text-align: center">
                                        <input type="checkbox" name="remove_file[]" class="remove_file" value="<?php echo $file['id']; ?>"/>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    <div>
                        <?php echo __('global:upload_files'); ?>:
                        <ul id="file-inputs">
                            <li><?php echo form_upload('invoice_files[]'); ?></li>
                        </ul>
                        <div class="submit-holder">
                            <a class="blue-btn" href="#" id="add-file-input"><span><?php echo __('global:add_more'); ?></span></a>
                        </div>
                        <br/>
                    </div>
                </div>
                <!-- /row end -->

                <input type="hidden" name="amount" value="0">

                <?php
                $data = array();
                $data['action'] = ($is_edit ? "edit" : "create");
                $data['parts'] = ($is_edit ? (isset($invoice->partial_payments[1]) ? $invoice->partial_payments : array('key' => 1)) : array('key' => 1));
                if ($is_edit) {
                    $data['currency_code'] = $invoice->currency_code;
                }
                $this->load->view('invoices/partial_input_container', $data);
                ?>

                <div class="hide-estimate hide-credit-note">
                    <div class="gateway-items row">
                        <?php require_once APPPATH . 'modules/gateways/gateway.php'; ?>
                        <?php $checked = $is_edit ? Gateway::get_item_gateways('INVOICE', $invoice->id) : null; ?>

                        <label><?php echo lang('gateways:paymentmethods') ?></label>

                        <?php if ($gateways): ?>
                            <?php
                            $first = true;
                            foreach ($gateways as $gateway) :
                                ?>
                                <div class="gateway <?php echo !$first ? 'not-first' : null; ?> <?php echo $gateway['gateway']; ?>">
                                    <input type="checkbox" name="gateways[<?php echo $gateway['gateway']; ?>]" id="gateways-<?php echo $gateway['gateway']; ?>" <?php echo (!$is_edit || $checked[$gateway['gateway']]) ? 'checked="checked"' : ''; ?> value="1"/>
                                    <label for="gateways-<?php echo $gateway['gateway']; ?>"><?php echo $gateway['title']; ?></label>
                                </div>
                                <?php
                                $first = false;
                            endforeach;
                            ?>
                        <?php else: ?>
                            <p><?php echo __('invoices:no_payment_gateways_enabled', array(site_url('admin/settings'))) ?></p>
                        <?php endif; ?>
                    </div>
                </div>
                <div class="hide-credit-note">
                    <?php assignments(set_radio('type', 'ESTIMATE', $type == "ESTIMATE") ? 'estimates' : 'invoices', ($is_edit ? $invoice->id : 0)); ?>
                </div>
                <div class="row">
                    <label for="nothing">&nbsp;</label>
                    <a href="#" class="blue-btn js-fake-submit-button"><span><?php echo __('global:save') ?> &rarr;</span></a>
                </div>
                <!-- /row -->
            </fieldset>

            <input type="submit" class="hidden-submit"/>
        </div>
        <!-- /form-holder end -->
    </div>
    <!-- /nine columns content-wrapper -->
    <?php echo form_close(); ?>
</div>
<script>

    <?php

    $default_format = "{{#settings.include_time_entry_dates}}{{{time_entry.date}}} ({{time_entry.start_time}} - {{time_entry.end_time}}){{#time_entry.note}}\n{{/time_entry.note}}{{/settings.include_time_entry_dates}}{{{time_entry.note}}}";
    $format = $default_format;

    if (Events::has_listeners('time_entry_dates_format_generated')) {
        $format = get_instance()->dispatch_return('time_entry_dates_format_generated', array());
        if (is_array($format)) {
            $format = $default_format;
        }
    }

    $default_invoice_line_item_template = "{{#tasks}}{{#split_by_milestone}}{{name}}
    ----------
    {{/split_by_milestone}}{{#notes}}{{{notes}}}

    {{/notes}}{{#time_entries}}{{{.}}}

    {{/time_entries}}{{/tasks}}";
    $invoice_line_item_template = $default_invoice_line_item_template;

    if (Events::has_listeners('invoice_line_item_template_generated')) {
        $invoice_line_item_template = get_instance()->dispatch_return('invoice_line_item_template_generated', array());
        if (is_array($invoice_line_item_template)) {
            $invoice_line_item_template = $default_invoice_line_item_template;
        }
    }

    ?>

    var time_entry_dates_format = <?php echo json_encode($format); ?>;
    var invoice_line_item_template = <?php echo json_encode($invoice_line_item_template); ?>;
    var existing_invoice_symbol = "";
    var client_ids_with_tokens = <?php echo json_encode($client_ids_with_tokens); ?>;

</script>
<script src="<?php echo Asset::get_src("mustache-0.8.1.min.js"); ?>"></script>
<script src="<?php echo Asset::get_src("invoice-form.js"); ?>"></script>