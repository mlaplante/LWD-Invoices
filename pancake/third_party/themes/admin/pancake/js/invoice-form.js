function is_period_type(type) {
    var period_types = [
        'period_day',
        'period_week',
        'period_month',
        'period_year'
    ];

    return (period_types.indexOf(type) !== -1);
}

function get_invoice_total(ignore_index) {
    var amount = 0;

    if (typeof (ignore_index) === "undefined") {
        ignore_index = null;
    }

    var items = [];
    var discounts = [];

    var key = 1;
    $('#invoice-items .details').each(function () {
        var el = $(this);
        var type = el.find('.js-invoice-item-type').val();
        var qty = el.find('.item_quantity').val();
        var rate = el.find('.item_rate').val();
        var period = is_period_type(type) ? el.parents('.sub-invoice-table').find('.item_period').val() : 1;
        var item_total = qty * rate * period;
        var discount = Billing.parse_amount_or_percentage(el.find('.item_discount').val(), item_total);
        var taxes = el.find('.multiselect').val();
        taxes = (taxes === null) ? [] : taxes;

        if (type === "fixed_discount" || type == "percentage_discount") {
            discounts.push({
                is_fixed: type === "fixed_discount",
                value: discount,
                key: key
            });
        } else {
            items.push({
                type: type,
                qty: qty,
                rate: rate,
                total_pre_tax_pre_discounts: item_total - discount,
                total_pre_tax_post_discounts: item_total - discount,
                total_post_tax_post_discounts: item_total - discount,
                discount: discount,
                taxes: taxes
            });
        }

        key++;
    });

    $.each(items, function(key, item) {
        // Apply fixed discounts:
        $.each(discounts, function(i, discount) {
            if (discount.is_fixed) {
                var val = discount.value / items.length;
                items[key].total_pre_tax_post_discounts -= val;
                items[key].total_post_tax_post_discounts -= val;
            }
        });

        // Apply percentage discounts:
        $.each(discounts, function(i, discount) {
            if (!discount.is_fixed && (ignore_index === null || discount.key < ignore_index)) {
                var val = items[key].total_pre_tax_post_discounts * (discount.value/100);
                items[key].total_pre_tax_post_discounts -= val;
                items[key].total_post_tax_post_discounts -= val;
            }
        });

        if (ignore_index === null) {
            // Apply non-compound taxes:
            $.each(item.taxes, function(i, tax_id) {
                var tax = pancake_taxes[tax_id];
                var is_compound = !!parseInt(tax.is_compound);

                if (!is_compound) {
                    var val = items[key].total_pre_tax_post_discounts * (tax.value / 100);
                    items[key].total_post_tax_post_discounts += val;
                }
            });

            // Apply compound taxes:
            $.each(item.taxes, function(i, tax_id) {
                var tax = pancake_taxes[tax_id];
                var is_compound = !!parseInt(tax.is_compound);

                if (is_compound) {
                    var val = items[key].total_post_tax_post_discounts * (tax.value / 100);
                    items[key].total_post_tax_post_discounts += val;
                }
            });
        }

        amount += items[key].total_post_tax_post_discounts;
    });

    return amount;
}

function getRemainingAmount() {
    var amount = get_invoice_total();
    var amount_left = toFixed(amount, 2);

    $('.partial-inputs').each(function () {
        var val = $(this).find('input.partial-amount').val();
        var is_percentage = $(this).find('.partial-percentage select').val();

        if (is_percentage == '1') {
            amount_left = amount_left - (amount * (val / 100));
        } else {
            if (amount == 0) {
                amount_left = 0;
                return;
            } else {
                amount_left = amount_left - val;
            }
        }
    });

    if (toFixed(amount_left) == 0.00) {
        return 0;
    }

    return amount_left;

}

function toFixed(value, precision) {
    var power = Math.pow(10, precision || 0);
    return String(Math.round(value * power) / power);
}


// Hide and show Multiparts

function hideMultiparts() {
    $('.partial-addmore a span').html($('.partial-addmore a').data('disabled'));
    $('.partial-addmore a').addClass('disabled');

    if ($('.partial-inputs').length > 1) {
        $('.partial-inputs:not(:first-child)').slideUp();
        $('.partial-inputs:first-child .partial-amount').data('old-value', $('.partial-inputs:first-child .partial-amount').val()).val(100);
        $('.partial-inputs:first-child .partial-percentage select').data('old-value', $('.partial-inputs:first-child .partial-percentage select').val()).val(1);
        $('.partial-inputs:first-child .partial-percentage .selector span').html($('.partial-inputs:first-child .partial-percentage select option:selected').html());
    }
}

function showMultiparts() {
    $('.partial-addmore a span').html($('.partial-addmore a').data('enabled'));
    $('.partial-addmore a').removeClass('disabled');

    if ($('.partial-inputs').length > 1 && $('.partial-inputs:first-child .partial-amount').data('old-value') != undefined) {
        $('.partial-inputs:not(:first-child)').slideDown();
        $('.partial-inputs:first-child .partial-amount').val($('.partial-inputs:first-child .partial-amount').data('old-value'));
        $('.partial-inputs:first-child .partial-percentage select').val($('.partial-inputs:first-child .partial-percentage select').data('old-value'));
        $('.partial-inputs:first-child .partial-percentage .selector span').html($('.partial-inputs:first-child .partial-percentage select option:selected').html());
    }
}

function updatePaymentPlanTotals() {
    var amount = get_invoice_total();
    var el = $('.payment-plan-amounts');

    var symbol = $($('#currency').length == 0 ? '.amount_left' : '#currency :selected').data('symbol');

    $('.difference .value').html(toFixed(amount, 2));
    $('.difference .symbol').html(symbol);
    //amountlefttobeadded
    var remaining = getRemainingAmount();
    if (remaining != 0) {
        el.find('.amount_left').addClass('remaining');
        el.find('.amount_left').html("<span class='label'>" + el.find('.amount_left').data(remaining > 0 ? 'amountlefttobeadded' : 'amounttoobig') + "</span>: <span class='symbol'>" + symbol + "</span><span class='value'></span>");
    } else {
        el.find('.amount_left').removeClass('remaining');
        el.find('.amount_left').html(el.find('.amount_left').data('noamountneeded'));
    }
    el.find('.amount_left .value').html(toFixed(remaining, 2));

    $("input.item_discount").each(Billing.update_total);
}

function delete_partial_payment() {
    $(this).parents('.partial-inputs').slideUp(function () {
        $(this).remove();
        updatePaymentPlanTotals();
    });
    return false;
}

function delete_line_item() {
    if ($(this).parents('table:first').parents('tbody').children('tr').length > 1) {
        $(this).parents('table:first').parents('tr:first').fadeOut(function () {
            $(this).remove();
            updatePaymentPlanTotals();
        });
    }
    return false;
}

function GetBetween($content, $start, $end) {
    var $r = explode($start, $content);
    if (!empty($r) && !empty($r[1])) {
        $r = explode($end, $r[1]);
        return $r[0];
    }
    return '';
}

var update_send_x_days_container = function($el) {
    var $send_x_days_before_container = $(".js-send-x-days-before"),
        easing = "slide";

    if (!($el instanceof jQuery)) {
        $el = $(this);
    } else {
        easing = "none";
    }

    if ($el.val() == '1') {
        if (easing == "slide") {
            $send_x_days_before_container.slideDown('fast');
        } else {
            $send_x_days_before_container.show();
        }
    } else {
        if (easing == "slide") {
            $send_x_days_before_container.slideUp('fast');
        } else {
            $send_x_days_before_container.hide();
        }
    }
};

$(document).on('change', '#auto_send', update_send_x_days_container);

var update_auto_charge_container = function($el) {
    var $send_x_days_before_container = $(".js-auto-charge"),
        easing = "slide";

    if (!($el instanceof jQuery)) {
        $el = $(this);
    } else {
        easing = "none";
    }

    if ($el.val() == '1') {
        if (easing == "slide") {
            $send_x_days_before_container.slideDown('fast');
        } else {
            $send_x_days_before_container.show();
        }
    } else {
        if (easing == "slide") {
            $send_x_days_before_container.slideUp('fast');
        } else {
            $send_x_days_before_container.hide();
        }
    }
};

$(document).on('change', '#auto_charge', update_auto_charge_container);

$(function () {

    update_send_x_days_container($("#auto_send"));

    if ($('.partial-payment-details').length == 0) {
        $('div.partial-inputs .partial-notes').width(386);
    }

    $('.partial-payment-delete:first').hide();

    currentSymbol = '';

    $('#currency').change(function () {
        updatePaymentPlanTotals();
        currentSymbol = $(this).find(':selected').data('symbol');
        $('.partial-percentage option[value=0]').html(currentSymbol);
        $('.partial-percentage .selector').each(function () {
            if ($(this).find('select').val() == 0) {
                $(this).find('span').html(currentSymbol);
            }
        });

        var regex = /\([^\)%]\)/;
        $('.js-invoice-item-type option').each(function () {
            var text = $(this).html();
            if (regex.test(text)) {
                $(this).html(text.replace(regex, "(" + currentSymbol + ")"));
            }
        });

        $('span#symbol, .currencySymbol').html(currentSymbol);
    });

    var symbol = $($('#currency').length == 0 ? '.amount_left' : '#currency :selected').data('symbol');
    var regex = /\([^\)%]\)/;
    $('.js-invoice-item-type option').each(function () {
        var text = $(this).html();
        if (regex.test(text)) {
            $(this).html(text.replace(regex, "(" + symbol + ")"));
        }
    });

    $('select[name^=partial-is_percentage]').change(function () {
        updatePaymentPlanTotals();
    });

    $('input.partial-amount, input.item_quantity, input.item_rate, input.item_period').livequery(function () {
        $(this).forceNumeric();
    });

    $('input.item_discount').livequery(function () {
        $(this).force_numeric_or_percentage();
    });

    $('#is_recurring').change(function () {
        if ($(this).val() == '1') {
            // This invoice is recurring, partial payments are disabled.
            hideMultiparts();
        } else {
            // This invoice is NOT recurring, partial payments are enabled.
            showMultiparts();
        }
    });

    $('.partial-addmore a').click(function () {
        if (!$(this).is(':disabled')) {
            // Button is not disabled, let's create another row for partial payments.

            newLength = ($('.partial-inputs').length + 1);
            // Destroy the first date picker, then rebuild it after cloning.
            $('.partial-inputs:first-child .datePicker').datepicker('destroy');
            newPartial = $('.partial-inputs:first-child').clone();
            newPartial.find('.datePicker').attr('name', 'partial-due_date' + '[' + newLength + ']').datepicker('destroy');
            // Set the new name, then call datepicker again.
            $('.partial-inputs:first-child .datePicker').each(function () {
                $(this).datepicker({
                    dateFormat: datePickerFormat
                });
            });

            newPartial.find('a').data('details', newLength).removeClass('key_1').addClass('key_' + newLength);
            newPartial.find('.partial-payment-details span').html($('.partial-input-container').data('markaspaid'));
            newPartial.find('input:not([type=checkbox])').val('');
            var remaining_amount = getRemainingAmount();
            remaining_amount = remaining_amount < 0 ? 0 : round(remaining_amount, 2);
            newPartial.find('input.partial-amount').val(remaining_amount);
            newPartial.find('input[type=checkbox]:checked').click();
            newPartial.find('input:not(.datePicker), select').each(function () {
                $(this).attr('name', $(this).attr('name').replace('[1]', '[' + newLength + ']'))
            });
            select = newPartial.find('select');
            check = newPartial.find('input[type=checkbox]');

            check.attr('id', check.attr('id') + newLength);
            select.attr('id', select.attr('id') + newLength);
            select.val(0);

            newPartial.find('input[type=text]').each(function () {
                $(this).attr('id', $(this).attr('id') + newLength);
            });

            $(newPartial).find('.partial-percentage > .selector').replaceWith(select);

            $(newPartial).find('.checker').replaceWith(check);
            $(newPartial).find('.partial-payment-delete').show();
            newPartial.hide().appendTo('.partial-input-container');
            $('.partial-input-container *:hidden').slideDown('normal');
            $('.partial-payment-delete:first').hide();
            updatePaymentPlanTotals();
            return false;

        }
    });

    $('input[name=type], #client').change();

    $("input.item_name").livequery(function () {

        var cache = {};
        var input = $(this);

        input.autocomplete({
            minLength: 2,
            source: function (request, response) {
                var term = request.term;
                if (term in cache) {
                    response(cache[ term ]);
                    return;
                }

                $.post(baseURL + 'admin/items/ajax_auto_complete', request, function (data) {
                    cache[ term ] = data;
                    response(data);
                }, 'json');
            },
            select: function (event, ui) {
                var period = is_period_type(ui.item.type) ? ui.item.period : 1;

                details = $(input).closest('tr.details');
                description = details.next('tr.description');
                cost = ui.item.qty * ui.item.rate * period;

                $('input.item_period', details).val(period);
                $('input.item_name', details).val(ui.item.name);
                $('input.item_quantity', details).val(ui.item.qty);
                $('input.item_discount', details).val('0.00');
                $('input.item_rate', details).val(ui.item.rate);

                var tax_ids = [];

                for (var tax_id in ui.item.tax_ids) {
                    if (ui.item.tax_ids.hasOwnProperty(tax_id)) {
                        tax_ids.push(parseInt(tax_id));
                    }
                }

                $(".has-multiselect", details).multiselect_update(tax_ids);
                $('input.item_cost', details).val(cost);
                $('span.item_cost', details).text(cost);
                $('select.type', details).val(ui.item.type);

                $('textarea.item_description', description).val(ui.item.description);
                updatePaymentPlanTotals();
            }
        });
    });

    // Add a new row
    $('a#add-row').click(function () {

        // Remove if there are others to clone
        details = $('#invoice-items tbody tr.details:first');
        description = $('#invoice-items tbody tr.description:first');

        if ($('#invoice-items tbody').children('tr.details:visible').length == 0) {
            details = details.show();
            description = description.show();
        }
        else {
            details = details.clone();
            description = description.clone();
        }

        $(".has-multiselect", details).multiselect_destroy();

        $('input.item_name', details).val('');
        $('input.item_quantity', details).val(1);
        $('input.item_period', details).val('');
        $('input.item_rate', details).val('0.00');
        $('input.item_discount', details).val('0.00');
        $('input.item_type_id', details).val('');
        $('input.item_time_entries', details).val('');
        $('input.item_cost', details).val('0.00');
        $('span.item_cost', details).text('0.00');
        $('.type-row select', details).val('standard');

        $('textarea.item_description', description).val('');

        $('#invoice-items > tbody').append('<tr class="parent-line-item-table-row"><td colspan="8" class="parent-line-item-table-cell"><table class="sub-invoice-table"></table></td></tr>');

        $('#invoice-items > tbody > tr:last table').append(details);
        $('#invoice-items > tbody > tr:last table').append(description);

        $(".multiselect", details).multiselect();
        $('.type-row select', details).each(Billing.update_item_type);

        updatePaymentPlanTotals();
        return false;
    });

    $('#add-file-input').click(function (e) {
        e.preventDefault();
        $('#file-inputs').append('<li><input name="invoice_files[]" type="file" /></li>');
    });

    $('.remove_file').click(function () {
        $(this).parent().parent().toggleClass('file_remove');
    });

    $('#add_files_edit').click(function () {
        $('#files tbody').append('<tr><td colspan="4"><input name="invoice_files[]" type="file" /></td></tr>');
        return false;
    });

    $('select[name=is_recurring]').change(function () {

        this.value == 1
                ? $('div#recurring-options').slideDown('slow')
                : $('div#recurring-options').slideUp('slow')

        return false;
    }).change();
    updatePaymentPlanTotals();

    $('table#invoice-items tbody.make-it-sortable').sortable({
        handle: 'a.sort',
        items: '> tr'
    });

});

function count(o) {
    var c = 0;
    for (k in o) {
        if (o.hasOwnProperty(k)) {
            c++;
        }
    }
    return c;
}

function fix_taxes_inputs_names() {
    var i = 0;
    $("select[multiple]").each(function () {
        $(this).attr("name", $(this).attr("name").replace("[][]", "[" + i + "][]"));
        i++;
    });
}

$(document).on('change', '[name=type]', function () {
    var type = this.value;

    $('.type-wrapper').hide();
    if (type == 'ESTIMATE') {
        $('.hide-estimate').hide();
    }
    else {
        $('.hide-estimate').show();

        if (type == 'CREDIT_NOTE') {
            $('.hide-credit-note').hide();
        } else {
            $('.hide-credit-note').show();
        }
    }

    if (type != 'SIMPLE') {
        $('#DETAILED-wrapper').show();
    }

    var prepped_type = type.toLowerCase();
    if (prepped_type === 'detailed') {
        prepped_type = 'invoice';
    }

    var ucwords = function (str) {
        str = str.toLowerCase();
        return str.replace(/(^([a-zA-Z\p{M}]))|([ -][a-zA-Z\p{M}])/g,
                function ($1) {
                    return $1.toUpperCase();
                });
    }

    var new_text = __('global:' + prepped_type);
    var new_text_ucfirst = ucwords(new_text);
    var old_text = __('global:invoice');
    var old_text_ucfirst = ucwords(old_text);
    var update = function (el) {
        el.each(function () {
            $(this).html($(this).html().split(old_text).join(new_text).split(old_text_ucfirst).join(new_text_ucfirst));
        });
    };

    $('.user_permissions_item_type').val(new_text + 's');
    update($('.assigned_users_list p, .assigned_users_list span, .assigned_users_list option, label[for=invoice_number]'));
});

$(document).on('change', '#client', function () {
    var project_id_select = $('#project_id');
    var projects = ['<option value="">' + $('#project_id option:first').text() + '</option>'];
    var value = $(this).val();
    var gateways;
    var $gateways = $(".gateway-items .gateway");
    var default_notes;
    var business_id;

    if (typeof (projects_per_client[value]) !== 'undefined') {
        $.each(project_order_per_client[value], function (key, project_id) {
            projects.push('<option value="' + project_id + '">' + projects_per_client[value][project_id] + '</option>');
        });
    }

    project_id_select.html(projects.join(''));

    var original_edit_value = project_id_select.data('original-edit-value');

    if (original_edit_value) {
        project_id_select.find('[value="' + original_edit_value + '"]').attr('selected', 'selected');
    }

    if (typeof business_identity_per_client[value] !== "undefined") {
        business_id = business_identity_per_client[value];
        gateways = enabled_gateways_per_business_identity[business_id];
        $gateways.show();
        $gateways.not(gateways.map(function (value) {
            return "." + value;
        }).join(', ')).hide();
    }

    // Only set the currency if not editing.
    if (!is_editing_invoice && !has_submitted_data) {
        $("#currency").val(default_currencies_per_client[value] ? default_currencies_per_client[value] : "0");

        if (typeof business_identity_per_client[value] !== "undefined") {
            default_notes = default_invoice_notes_per_business_identity[business_id];
            $('#notes').redactor('set', default_notes);
            $('.multiselect').val(default_taxes_per_client[value]).change();
        } else {
            $('.multiselect').val(default_tax_ids).change();
            $('#notes').redactor('set', '');
        }
    }

    if (client_ids_with_tokens.indexOf(parseInt(value)) !== -1) {
        $(".js-not-has-auto-charge").hide();
        $(".js-has-auto-charge").show();
    } else {
        $(".js-not-has-auto-charge").show();
        $(".js-has-auto-charge").hide();
        $("#auto_charge").val(0);
    }

});

var Billing = {
    init: function () {
        $(document)
                .on('change', '.type-row select', Billing.update_item_type)
                .on('change', '#project_id', Billing.update_all_item_types)
                .on('change', 'select.item_name', Billing.update_item_id)
                .on('click', '.filter-time-entries', Billing.show_time_entries_modal)
                .on('change', '.toggle_time_entry_inclusion', Billing.toggle_time_entry_inclusion)
                ;

        $('.js-invoice-form')
                .on("keyup", "input.item_quantity, input.item_rate, input.item_discount, input.item_period", Billing.update_total)
                .on("change", ".has-multiselect", updatePaymentPlanTotals)
                .on('click', ".partial-payment-delete", delete_partial_payment)
                .on('click', '#invoice-items .delete', delete_line_item)
                .on('change keyup', 'input.partial-amount, select[id^=partial-percentage], #invoice-items .item_quantity, #invoice-items .item_period, #invoice-items .item_rate, #invoice-items .item_discount', updatePaymentPlanTotals)
                .on('submit', fix_taxes_inputs_names)
                ;

        $('.type-row select').each(function () {
            Billing.update_item_type.call(this, is_editing_invoice);
        });

        $('.js-invoice-form .item_rate').each(Billing.update_total);
        updatePaymentPlanTotals();
    },
    toggle_time_entry_inclusion: function () {
        // Expects this to be ".toggle_time_entry_inclusion"
        var el = $(this);
        var id = 0;
        var item = {};
        var line_item = $('.parent-line-item-table-cell:nth(' + el.data('line-item-index') + ')');
        var project_id = parseInt($('#project_id').val(), 10);
        project_id = isNaN(project_id) ? '' : project_id;
        var item_type_id = $('select.item_name', line_item).find(':selected').data('item-type-value');
        item_type_id = typeof item_type_id === 'undefined' ? line_item.find('.item_type_id').val() : item_type_id;
        var new_time_entries = line_item.find('.item_time_entries').val().split(',');
        if (el.is(':checked')) {
            new_time_entries.push(el.data('time-entry-id').toFixed(0));
        } else {
            var key = $.inArray(el.data('time-entry-id').toFixed(0), new_time_entries);
            if (key !== '-1') {
                new_time_entries.splice(key, 1);
            }
        }

        line_item.find('.item_time_entries').val(new_time_entries.join(','));

        if (item_type_id.indexOf("MILESTONE_") !== -1) {
            id = (item_type_id.substr("MILESTONE_".length));
            item = time_entries[project_id].milestones[id];
        } else if (item_type_id.indexOf("TASK_") !== -1) {
            id = (item_type_id.substr("TASK_".length));
            item = time_entries[project_id].tasks[id];
        }

        var details = Billing.calculate_details(item.time_entries, new_time_entries);
        $('input.item_quantity', line_item).val(details.quantity);
        $('input.item_discount', line_item).val(0);
        $('input.item_rate', line_item).val(details.rate).each(Billing.update_total);
        $('.item_description', line_item).val(details.notes);

    },
    show_time_entries_modal: function () {
        // Expects this to be ".filter-time-entries"
        var el = $(this);
        var line_item = el.parents('.parent-line-item-table-cell');

        var line_item_index = $('.parent-line-item-table-cell').index(line_item);

        var time_entry_records = {};

        var project_id = parseInt($('#project_id').val(), 10);
        project_id = isNaN(project_id) ? '' : project_id;

        var item_type_id = $('select.item_name', line_item).find(':selected').data('item-type-value');
        item_type_id = typeof item_type_id === 'undefined' ? line_item.find('.item_type_id').val() : item_type_id;

        if (item_type_id.indexOf("MILESTONE_") !== -1) {
            // Milestone
            time_entry_records = time_entries[project_id].milestones[item_type_id.substr("MILESTONE_".length)].time_entries;
        } else if (item_type_id.indexOf("TASK_") !== -1) {
            // Task
            time_entry_records = time_entries[project_id].tasks[item_type_id.substr("TASK_".length)].time_entries;
        }

        var selected_time_entries = line_item.find('.item_time_entries').val().split(',');

        var time_entries_help = show_task_time_interval_help ? '<p>Time entries are rounded up to the nearest ' + task_time_interval + '.<br />You can change this in the "Time Entry Rounding" setting.</p>' : '';

        var html = '<div class="row"><div class="height_transition">' + time_entries_help + '<div class="view_entries_table"><table id="view-entries" class="listtable pc-table table-activity" style="width: 100%;"><thead><tr><th class="cell1">Include in invoice?</th><th class="cell2">User</th><th class="cell3">Date</th><th class="cell4">Duration</th><th class="cell4">' + __('timesheet:rounded') + '</th></tr></thead><tbody>';

        $.each(time_entry_records, function (id, row) {
            html += '<tr><td class="cell1 pic"><label style="display:block;"><input type="checkbox" data-line-item-index="' + line_item_index + '" class="toggle_time_entry_inclusion" ' + ($.inArray(row.id, selected_time_entries) !== -1 ? 'checked="checked"' : '') + ' data-item-type-id="' + item_type_id + '" data-time-entry-id="{id}"></label></td>';
            html += '<td class="cell2 user"><img src="http://www.gravatar.com/avatar/{email_md5}?s=40&amp;d=mm&amp;r=g" class="members-pic"> <span class="time-sheet-name">{user_display_name}</span></td>';
            html += '<td class="cell3 date"><span>{date}</span></td>';
            html += '<td class="cell4 duration">{duration}<br /><small>(<span class="start_time"><strong>From:</strong> <span>{start_time}</span><span class="end_time"><strong>To:</strong> <span>{end_time}</span>)</small></td>';
            html += '<td class="cell4 duration">{rounded_duration}</td>';

            html = html.split('{id}').join(row.id);
            html = html.split('{email_md5}').join(row.email_md5);
            html = html.split('{user_display_name}').join(row.user_display_name);
            html = html.split('{date}').join(row.date);
            html = html.split('{start_time}').join(row.start_time);
            html = html.split('{end_time}').join(row.end_time);
            html = html.split('{duration}').join(row.duration);
            html = html.split('{rounded_duration}').join(row.rounded_duration);
            html = html.split('{note}').join(row.note);
        });

        html += '</tbody></table></div></div>';

        open_reveal(html);
        return false;
    },
    update_all_item_types: function () {
        $('.parent-line-item-table-row .type-row select').each(Billing.update_item_type);
    },
    parse_amount_or_percentage: function (amount, total) {
        if ((amount + '').indexOf('%') !== -1) {
            // Is a percentage.
            var percentage = parseFloat(amount.split('%').join(''));
            return (total * percentage) / 100;
        } else {
            // Is an amount.
            amount = parseFloat(amount);
            return isNaN(amount) ? 0 : amount;
        }
    },
    update_total: function () {
        // Expects this to be "input.item_quantity, input.item_rate, etc."

        var row = $(this).closest('tr');
        var type = $('.js-invoice-item-type', row).val();
        var qty = $('input.item_quantity', row).val();
        var rate = $('input.item_rate', row).val();
        var period = is_period_type(type) ? row.parents('.sub-invoice-table').find('.item_period').val() : 1;
        var cost = toFixed(qty * rate * period, 2);
        var discount = Billing.parse_amount_or_percentage($('input.item_discount', row).val(), cost);

        if (type == "fixed_discount") {
            cost = toFixed(discount, 2);
        } else if (type == "percentage_discount") {
            var index = $('.item_discount:last').closest('tr').index('.details') + 1;
            cost = toFixed(get_invoice_total(index) * (discount / 100), 2);
        } else {
            cost = toFixed(cost - discount, 2);
        }

        $('input.item_cost', row).val(cost);
        $('span.item_cost', row).text(cost);
    },
    update_item_id: function (do_not_recalculate_time_entries) {

        if (typeof do_not_recalculate_time_entries !== 'boolean') {
            do_not_recalculate_time_entries = false;
        }

        // Expects this to be "select.item_name"
        var el = $(this);
        var line_item = el.parents('.parent-line-item-table-cell');
        var project_id = parseInt($('#project_id').val(), 10);
        project_id = isNaN(project_id) ? '' : project_id;
        var item_type_id = el.find(':selected').data('item-type-value');
        item_type_id = typeof item_type_id === 'undefined' ? line_item.find('.item_type_id').val() : item_type_id;
        var id = 0;
        var item = {};
        var details = {};
        var new_time_entries = [];

        if (do_not_recalculate_time_entries) {
            new_time_entries = $('.item_time_entries', line_item).val();
            if (new_time_entries === '') {
                new_time_entries = [];
            } else {
                new_time_entries = new_time_entries.split(',');
            }
        }

        if (item_type_id.indexOf("MILESTONE_") !== -1) {
            // Milestone
            id = (item_type_id.substr("MILESTONE_".length));
            item = time_entries[project_id].milestones[id];

            if (!do_not_recalculate_time_entries) {
                // Preselect all time entries.
                $.each(item.time_entries, function (key, v) {
                    new_time_entries.push(key);
                });
            }

            details = Billing.calculate_details(item.time_entries, new_time_entries);

            $('.item_time_entries', line_item).val(new_time_entries.join(','));
            $('.item_description', line_item).val(details.notes);
            $('input.item_quantity', line_item).val(details.quantity);
            $('input.item_discount', line_item).val(0);
            $('input.item_rate', line_item).val(details.rate).each(Billing.update_total);
        } else if (item_type_id.indexOf("TASK_") !== -1) {
            // Task
            id = (item_type_id.substr("TASK_".length));
            item = time_entries[project_id].tasks[id];

            if (!do_not_recalculate_time_entries) {
                // Preselect all time entries.
                $.each(item.time_entries, function (key, v) {
                    new_time_entries.push(key);
                });
            }

            details = Billing.calculate_details(item.time_entries, new_time_entries);

            $('.item_time_entries', line_item).val(new_time_entries.join(','));
            $('.item_description', line_item).val(details.notes);
            $('input.item_quantity', line_item).val(details.quantity);
            $('input.item_discount', line_item).val(0);
            $('input.item_rate', line_item).val(details.rate).each(Billing.update_total);
        } else if (item_type_id.indexOf("EXPENSE_") !== -1) {
            // Expense
            id = (item_type_id.substr("EXPENSE_".length));
            item = expenses[project_id][id];

            $('.item_description', line_item).val(item.description);
            $('input.item_quantity', line_item).val(parseFloat(item.qty));
            $('input.item_discount', line_item).val(0);
            // $('input.tax_id', line_item).val(item.tax_id); -> Tax IDs for expenses are not implemented at the moment.
            $('input.item_rate', line_item).val(parseFloat(item.rate)).each(Billing.update_total);
        }

        $('.item_type_id', line_item).val(item_type_id);
    },
    calculate_details: function (time_entries_records, selected_time_entries) {
        var rate = 0;
        var quantity = 0;
        var total = 0;
        var data = {tasks: {}, split_by_milestone: settings.split_line_items_by == "project_milestones"};

        if (settings.include_time_entry_dates === "0") {
            settings.include_time_entry_dates = false;
        }

        if (settings.include_time_entry_dates === "1") {
            settings.include_time_entry_dates = true;
        }

        $.each(time_entries_records, function (time_entry_id, row) {
            if (typeof selected_time_entries === 'undefined' || $.inArray(row.id, selected_time_entries) !== -1) {

                var task = time_entries[row.project_id].tasks[row.task_id];

                if ((task.notes != '' && task.notes !== null) || (row.note != '' && row.note !== null) || settings.include_time_entry_dates) {
                    if (typeof (data.tasks[row.task_id]) === "undefined") {
                        data.tasks[row.task_id] = {
                            notes: task.notes,
                            name: task.name,
                            time_entries: []
                        };
                    }
                }

                var hours = parseFloat(row.rounded_minutes) / 60;
                quantity += hours;
                total += hours * parseFloat(task.rate);

                if ((row.note != '' && row.note !== null) || settings.include_time_entry_dates) {
                    data.tasks[row.task_id].time_entries.push(Mustache.render(time_entry_dates_format, {settings: settings, time_entry: row}));
                }
            }
        });

        rate = total / quantity;
        rate = parseFloat(toFixed(rate, 2));
        quantity = parseFloat(toFixed(quantity, 2));
        if (isNaN(rate)) {
            rate = 0;
        }

        if (isNaN(quantity)) {
            quantity = 0;
        }

        var buffer = [];
        $.each(data.tasks, function (key, value) {
            buffer.push(value);
        });
        data.tasks = buffer;

        return {
            rate: rate,
            quantity: quantity,
            notes: Mustache.render(invoice_line_item_template, data).trim()
        };
    },
    update_item_type: function (do_not_update_id) {
        // Expects this to be ".type-row select"

        do_not_update_id = typeof do_not_update_id !== 'undefined' && do_not_update_id;

        var el = $(this);
        var line_item = el.parents('.parent-line-item-table-cell');
        var current_item_id = line_item.find('.item_type_id').val();
        var item_name = line_item.find('.item_name');
        var old_type = item_name.data('item-type');
        old_type = typeof old_type === 'undefined' ? 'standard' : old_type;
        var old_project_id = item_name.data('project-id');
        old_project_id = typeof old_project_id === 'undefined' ? 0 : parseInt(old_project_id, 10);
        var new_el = '';
        var value = el.val();
        var project_id = parseInt($('#project_id').val(), 10);
        var suffix = '';
        var item_type = '';
        var selected_id = '';

        project_id = isNaN(project_id) ? 0 : project_id;

        // Show fields if item is no longer a discount.
        if ((value !== "fixed_discount" && value !== "percentage_discount") && (old_type === "fixed_discount" || old_type === "percentage_discount")) {
            $(line_item).removeClass("discount-line-item");
        }

        // Show fields if item is no longer a flat rate.
        if (value !== "flat_rate" && value !== "expense") {
            $(line_item).removeClass("flat-rate-line-item");
        }

        $(line_item).removeClass('item-' + old_type);
        $(line_item).addClass('item-' + value);

        switch (value) {
            case 'period_day':
            case 'period_week':
            case 'period_month':
            case 'period_year':

                break;
            case 'expense':
                if (old_type !== 'expense' || old_project_id !== project_id) {
                    $(line_item).addClass("flat-rate-line-item");

                    if (old_type !== 'expense') {
                        $('input.item_type_id', line_item).val('');
                        $('input.item_time_entries', line_item).val('');
                    }

                    new_el = '<span class="dropdown-arrow"><select class="item_name" data-project-id="' + project_id + '" data-item-type="expense" name="invoice_item[name][]" >';
                    if (project_id === 0) {
                        new_el = new_el + '<option value="">-- Select a project first --</option>';
                    } else {
                        if (typeof expenses[project_id] === 'undefined') {
                            new_el = new_el + '<option value="">-- No unbilled expenses --</option>';
                        } else {
                            new_el = new_el + '<option value="">-- Select expense --</option>';

                            item_type = "EXPENSE_";
                            selected_id = current_item_id.indexOf(item_type) !== -1 ? (current_item_id.substr(item_type.length)) : null;

                            $.each(expenses[project_id], function (expense_id, expense) {
                                new_el += "<option data-item-type-value='" + item_type + expense_id + "' " + (selected_id === expense_id ? 'selected="selected"' : '') + ">" + expense.name + "</option>";
                            });
                        }
                    }
                    new_el = new_el + '</select></span>';
                    item_name.parents('.name-row').html(new_el);
                    if (!do_not_update_id) {
                        $('select.item_name', line_item).each(function () {
                            Billing.update_item_id.call(this, true);
                        });
                    }
                }
                break;
            case 'time_entry':
                if (old_type !== 'time_entry' || old_project_id !== project_id) {

                    if (old_type === 'expense') {
                        $('input.item_type_id', line_item).val('');
                        $('input.item_time_entries', line_item).val('');
                    }

                    new_el = '<span class="dropdown-arrow"><select class="item_name" data-project-id="' + project_id + '" data-item-type="time_entry" name="invoice_item[name][]" >';
                    if (project_id === 0) {
                        new_el += '<option value="">-- Select a project first --</option>';
                    } else {
                        if (typeof time_entries[project_id] === 'undefined') {
                            new_el += '<option value="">-- No unbilled time entries --</option>';
                        } else {
                            new_el += '<option value="">-- Select time entry --</option>';

                            suffix = '<div class="filter-time-entries"><a href="#" class="blue-btn"><span>Modify Time Entries</span></a></div>';

                            item_type = "MILESTONE_";
                            selected_id = current_item_id.indexOf(item_type) !== -1 ? (current_item_id.substr(item_type.length)) : null;

                            new_el += '<optgroup label="Milestones">';
                            $.each(time_entries[project_id].milestones, function (task_id, task) {
                                new_el += "<option data-item-type-value='" + item_type + task_id + "' " + (selected_id === task_id ? 'selected="selected"' : '') + ">" + task.name + "</option>";
                            });
                            new_el += '</optgroup>';

                            item_type = "TASK_";
                            selected_id = current_item_id.indexOf(item_type) !== -1 ? (current_item_id.substr(item_type.length)) : null;

                            new_el += '<optgroup label="Tasks">';
                            $.each(time_entries[project_id].tasks, function (milestone_id, milestone) {
                                new_el += "<option data-item-type-value='" + item_type + milestone_id + "' " + (selected_id === milestone_id ? 'selected="selected"' : '') + ">" + milestone.name + "</option>";
                            });
                            new_el += '</optgroup>';

                        }
                    }
                    new_el += '</select></span>' + suffix;
                    item_name.parents('.name-row').html(new_el);
                    if (!do_not_update_id) {
                        $('select.item_name', line_item).each(function () {
                            Billing.update_item_id.call(this, true);
                        });
                    }
                }
                break;
            default:
                // It was one of the above before, so now it needs turning back to text.
                var name_row = item_name.parents('.name-row');
                if (old_type !== "standard" && old_type !== "flat_rate") {
                    new_el = '<input type="text" class="item_name" data-project-id="' + project_id + '" data-item-type="standard" name="invoice_item[name][]" />';
                    name_row.html(new_el);
                    $('input.item_type_id', line_item).val('');
                    $('input.item_time_entries', line_item).val('');
                }

                name_row.find('.item_name').data("item-type", value);

                if (value === "fixed_discount" || value === "percentage_discount") {
                    $(line_item).addClass("discount-line-item");
                } else if (value === "flat_rate") {
                    $(line_item).addClass("flat-rate-line-item");
                    $(line_item).find(".item_quantity").val(1).change();
                }

                break;
        }

    }
};

Billing.init();

(function ($, window, document) {
    var is_submitting = true;

    $(document).on('submit', 'form', function () {
        is_submitting = true;
    });

    window.onbeforeunload = function () {
        if (!is_submitting) {
            return __("global:beforeunload");
        }
    };

    $(document).ready(function() {
        var previous = "";

        $("select, input, textarea").on('focus', function () {
            var $el = $(this);
            var type = $el.attr("type");

            if (type == "checkbox" || type == "radio") {
                previous = $el.is(":checked");
            } else {
                previous = $el.val();
            }
        }).on("change keyup", function() {
            var $el = $(this);
            var type = $el.attr("type");
            var value;

            if (type == "checkbox" || type == "radio") {
                value = $el.is(":checked");
            } else {
                value = $el.val();
            }

            if (value !== previous) {
                is_submitting = false;
            }
        });
    });

})(jQuery, window, document);