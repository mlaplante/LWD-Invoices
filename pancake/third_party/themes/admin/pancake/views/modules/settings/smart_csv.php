<div id="header">
    <div class="row">
        <h2 class="ttl ttl3">Import <?php echo humanize($import_type); ?></h2>
		<?php echo $template['partials']['search']; ?>
    </div>
</div>
<div class="row imports form-holder">
    <?php if ($errored) : ?>
        <div class="twelve columns import_error import_notification">
            <div class="number">!</div>
            <div class="details">
                <p class="title">Your import data has some issues you need to fix.</p>
                <?php if (count($required_errors) > 0): ?>
                    <p>The following data was missing:</p>
                    <ul>
                        <?php foreach ($required_errors as $error): ?>
                            <li>Record #<?php echo $error['record']; ?> - <?php echo $pancake_fields[$error['field']]; ?></li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
                <?php if (count($invalid_errors) > 0): ?>
                    <p>The following data was in an invalid format:</p>
                    <ul>
                        <?php foreach ($invalid_errors as $error): ?>
                            <li>Record #<?php echo $error['record']; ?> - <?php echo $pancake_fields[$error['field']]; ?></li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>
        </div>
    <?php else: ?>
        <?php if (!notification_hidden('import_tutorial')): ?>
            <div class="twelve columns import_notice import_notification">
                <div class="number">?</div>
                <div class="details">
                    <p class="title">Help Pancake process your CSV file to import your data correctly.</p>
                    <p><strong>To import all your data, you just have to follow a few simple steps:</strong></p>
                    <ol>
                        <li>Match the fields to the right columns in your CSV file. The live preview will update automatically.</li>
                        <li>Review the live preview, fixing any data that's missing or invalid.</li>
                        <li>Click the "Import Records" button. That's it!</li>
                    </ol>
                    <p><a href='#' class='dont-show-this-again blue-btn'>Got it, don't show this again</a></p>
                </div>
            </div>
        <?php endif;?>
    <?php endif; ?>
    <div class="four columns">
        <h4>Fields</h4>
        <?php foreach ($pancake_fields as $field => $human_field): ?>
            <?php $item = (substr($field, 0, strlen("item_")) == "item_") ? (get_between($field, '_', '_') > $items_to_show ? "hidden" : "") . " js-item js-item-" . get_between($field, '_', '_') : ""; ?>
            <?php $payment = (substr($field, 0, strlen("payment_")) == "payment_") ? (get_between($field, '_', '_') > $payments_to_show ? "hidden" : "") . " js-payment js-payment-" . get_between($field, '_', '_') : ""; ?>
            <div class='pancake_field <?php echo $item; ?> <?php echo $payment; ?> <?php echo $field; ?>' data-field='<?php echo $field; ?>'>
                <label>
                    <span class="import_field_label"><?php echo $human_field ?></span>
                    <div class='select'>
                        <div class="sel-item dropdown-arrow">
                            <select class='import_translation' name="import[<?php echo $field ?>][translation]">
                                <option value='0' <?php echo isset($processed_field_data[$field]['translation']) ? ($processed_field_data[$field]['translation'] == '0' ? 'selected="selected"' : '') : ''; ?> >-- Leave empty --</option>
                                <option value='1' <?php echo isset($processed_field_data[$field]['translation']) ? ($processed_field_data[$field]['translation'] == '1' ? 'selected="selected"' : '') : ''; ?> >-- Use multiple columns --</option>
                                <?php foreach ($import_data['fields'] as $import_field): ?>
                                    <?php if (count($processed_field_data) > 0): ?>
                                        <?php $selected = isset($processed_field_data[$field]['translation']) ? ($processed_field_data[$field]['translation'] == $import_field ? 'selected="selected"' : '') : ''; ?>
                                    <?php else: ?>
                                        <?php $selected = (isset($mapping[$import_field]) && $mapping[$import_field] == $field) ? 'selected="selected"' : ''; ?>
                                    <?php endif; ?>
                                    <option value="<?php echo $import_field; ?>" <?php echo $selected; ?> ><?php echo $import_field; ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                </label>
                <label class='field_details <?php echo isset($processed_field_data[$field]['translation']) ? ($processed_field_data[$field]['translation'] == '1' ? 'display' : '') : ''; ?> layout'>
                    <span class="import_field_label format">Layout<br /><a href="#" class="layout_help_link">(click here for help)</a></span>
                    <textarea class='import_layout'><?php echo isset($processed_field_data[$field]['layout']) ? $processed_field_data[$field]['layout'] : ''; ?></textarea>
                </label>
                <div class='clear'></div>
                <?php foreach ($import_data['fields'] as $import_field): ?>
                    <label class='field_details reformat <?php echo isset($processed_field_data[$field]['layout']) ? ( stristr($processed_field_data[$field]['layout'], $import_field) ? 'display' : '') : ''; ?>' data-csv-field='<?php echo $import_field; ?>'>
                        <span class="import_field_label format"><?php echo $import_field; ?></span>
                        <div class='select'>
                            <div class="sel-item dropdown-arrow">
                                <select class='import_reformat'>
                                    <option value="leave_as_is" <?php echo isset($processed_field_data[$field]['reformats'][$import_field]) ? ($processed_field_data[$field]['reformats'][$import_field] == 'leave_as_is' ? 'selected="selected"' : '') : 'selected="selected"'; ?>>Leave as is</option>
                                    <option value="use_first_word" <?php echo isset($processed_field_data[$field]['reformats'][$import_field]) ? ($processed_field_data[$field]['reformats'][$import_field] == 'use_first_word' ? 'selected="selected"' : '') : ''; ?>>Use the first word</option>
                                    <option value="use_all_but_first_word" <?php echo isset($processed_field_data[$field]['reformats'][$import_field]) ? ($processed_field_data[$field]['reformats'][$import_field] == 'use_all_but_first_word' ? 'selected="selected"' : '') : ''; ?>>Use all but the first word</option>
                                    <option value="multiply_by_100" <?php echo isset($processed_field_data[$field]['reformats'][$import_field]) ? ($processed_field_data[$field]['reformats'][$import_field] == 'multiply_by_100' ? 'selected="selected"' : '') : ''; ?>>Multiply by 100</option>
                                </select>
                            </div>
                        </div>
                    </label>
                <?php endforeach; ?>
            </div>
        <?php endforeach; ?>
        <div class='import_status_ok'>
            <hr />
            <p>Before you proceed with your import, please use the live preview to make sure all of your records look right to you. If they are not right, you can edit them in the live preview.</p>
            <form class='center imports_form' method='post'>
                <input type='hidden' name='import_data' value="<?php echo base64_encode(json_encode($import_data)); ?>" />
                <input type='hidden' name='import_type' value="<?php echo $import_type; ?>" />
                <input type='hidden' name='processed_field_data' class='processed_field_data' />
                <input type='hidden' name='processed_import_data' class='processed_import_data' />
                <input type='hidden' name='interpreted_import_data' class='interpreted_import_data' />
                <button type='submit' class='import_button button'>Import <?php echo count($import_data['records']); ?> records</button>
            </form>
        </div>
    </div>
    <div class="eight columns">
        <h4>Live Preview</h4>
        <div class='live_previews'>
            <div class='imported_record'>
                <table>
                    <tbody>
                        <tr class='live_preview_row_id'>
                            <td colspan='2' class='live_preview_header '>Record #<span class='row_number'>1</span></td>
                        </tr>
                        <?php $has_items = false; ?>
                        <?php $has_payments = false; ?>
                        <?php foreach ($pancake_fields as $field => $human_field): ?>
                            <?php $item = (substr($field, 0, strlen("item_")) == "item_") ? (get_between($field, '_', '_') > 3 ? "hidden" : "")." js-item js-item-".get_between($field, '_', '_') : ""; ?>
                            <?php $has_items = $item ? true : $has_items; ?>
                            <?php $payment = (substr($field, 0, strlen("payment_")) == "payment_") ? (get_between($field, '_', '_') > 1 ? "hidden" : "")." js-payment js-payment-".get_between($field, '_', '_') : ""; ?>
                            <?php $has_payments = $payment ? true : $has_payments; ?>

                            <tr class="<?php echo $item; ?> <?php echo $payment; ?>">
                                <td class='live_preview_header'><?php echo $human_field; ?> <?php echo in_array($field, $required_fields) ? "<span class='required'>(required)</span>" : ''; ?></td>
                                <td>
                                    <?php if (in_array($field, $textareas)): ?>
                                        <textarea data-pancake-field='<?php echo $field; ?>' class='<?php echo $field; ?> live_preview_field'></textarea>
                                    <?php else: ?>
                                        <input data-pancake-field='<?php echo $field; ?>' type='text' class='<?php echo $field; ?> live_preview_field'>
                                    <?php endif; ?>
                                    <div class='live_interpretation' data-interpreted-field='<?php echo $field; ?>'></div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            <?php if ($has_items): ?>
                <div class='center'>
                    <a href='#' class="js-show-another-item button">Add another line item</a>
                    <?php if ($has_payments): ?>
                        <a href='#' class="js-show-another-payment button">Add another payment</a>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
            <div class='center'>
                <a href='#' class="back button disabled">&lt;&lt; Previous Record</a>
                <a href='#' class="button disabled"><span class='row_number'>1</span> of <?php echo count($import_data['records']); ?></a>
                <a href='#' class="next button">Next Record &gt;&gt;</a>
            </div>
        </div>
    </div>
    <div class="imports_layout_help">
        <h4>How to use multiple columns</h4>
        <p>Sometimes, CSVs have information in different columns that might have to fit into the same field in Pancake. For, that, we allow you to lay those columns out in whatever way you want.</p>
        <p>It's similar to the way invoice emails work. You write {Your Column Name}, and that is converted into the right value for each record.</p>
        <p>For example, if your CSV has a Street, City, Zip, State and Country columns, but they all have to be put in a single Address field, here's how you could do it:</p>
        <pre>
{Street},
{City},
{State} {Zip},
{Country}
        </pre>
        <p>Pancake will fetch the values for those columns and apply them to the layout for each of the records.</p>
        <p>Give it a try! The live preview updates automatically, so you can see in real time how your layout will turn out.</p>
    </div>
</div>
<script>
    var current_row = 1,
        import_type = '<?php echo $import_type;?>',
            last_query = '',
            row_count = <?php echo count($import_data['records']); ?>,
            processed_import_data = <?php echo!empty($processed_import_data) ? json_encode($processed_import_data) : '{}'; ?>,
            import_data = <?php echo json_encode($import_data); ?>,
            types = <?php echo json_encode($types); ?>,
            interpretation_els = {},
            live_preview_els = {},
            fields = <?php echo json_encode(array_keys($pancake_fields)); ?>;

    $.each(fields, function(i, field) {
        interpretation_els[field] = $('.live_interpretation[data-interpreted-field="' + field + '"]');
        live_preview_els[field] = $('.live_preview_field[data-pancake-field="' + field + '"]');
    });

<?php if (empty($processed_import_data)): ?>
        $.each(import_data.records, function(i, v) {
            processed_import_data[i] = <?php echo $initial_fields; ?>;
        });
<?php endif; ?>

    load(1);
</script>