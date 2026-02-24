// make it safe to use console.log always
(function(b){function c(){}for(var d="assert,count,debug,dir,dirxml,error,exception,group,groupCollapsed,groupEnd,info,log,timeStamp,profile,profileEnd,time,timeEnd,trace,warn".split(","),a;a=d.pop();){b[a]=b[a]||c}})((function(){try
{console.log();return window.console;}catch(err){return window.console={};}})());

var __ = function(string, variables) {
    string = (typeof pancake_language_strings[string] !== 'undefined') ? pancake_language_strings[string] : string;

    if (typeof variables === "object") {
        var i = 0;
        $.each(variables, function(key, value) {
            string = string.split(':'+(i + 1)).join(value);
            i++;
        });
    }

    return string;
};

var site_url = function(url) {
    if (!url) {
        url = "";
    }
    return raw_site_url.split("{url}").join(url);
};

refreshTrackedHoursUrl = site_url('ajax/refresh_tracked_hours/');
baseURL = site_url();
siteURL = site_url();
php_date_format = settings.date_format;
storeTimeUrl = site_url('ajax/store_time');
submit_import_url = site_url('admin/settings/submit_import/');
lang_loading_please_wait = __('update:loadingpleasewait');
submit_hours_url = site_url('admin/projects/times/add_hours');
use_24_hours = settings.time_format.indexOf('A') === -1;

var redactor_options = {
    minHeight: 150,
    imageUpload: site_url("ajax/image_upload"),
    fileUpload: site_url("ajax/file_upload"),
    imageGetJson: site_url("ajax/image_library")
};

window.is_document_ready = false;
$(document).ready(function() {
    window.is_document_ready = true;
    $(document).foundationTopBar();

    var is_iframe = $("body").is(".iframe");

    if (!is_iframe) {
        $(document).on("click", ".fire-ajax", function(e) {
            open_reveal($(this).attr('href'));
            return false;
        });

        // Fixes issue with forms not getting submitted when the Enter key is pressed.
        $(document).on('keypress', 'input, select', function(e) {
            if (e.keyCode == 13) {
                $(this).parents('form').trigger('submit');
            }
        });
    }
});

(function($) {
    var update_timer = function(timer, current_seconds, last_modified_timestamp) {
        current_seconds = current_seconds + (current_timestamp() - last_modified_timestamp);
        var hours = Math.floor(current_seconds / 3600);
        current_seconds = current_seconds - (hours * 3600);
        var minutes = Math.floor(current_seconds / 60);
        current_seconds = current_seconds - (minutes * 60);
        var seconds = current_seconds;

        hours = hours > 9 ? hours : '0' + hours.toFixed(0);
        minutes = minutes > 9 ? minutes : '0' + minutes.toFixed(0);
        seconds = seconds > 9 ? seconds : '0' + seconds.toFixed(0);

        timer.find('.timer-time').html(hours + ':' + minutes + ':' + seconds);
    };

    var current_timestamp = function() {
        return (+new Date() / 1000).toFixed(0);
    }

    $.fn.timer = function() {
        this.each(function() {

            // Local reference for use in closures.
            var timer = $(this);

            if (timer.hasClass("js-processed-timer")) {
                // Do nothing.
                return;
            }

            var timer_interval = 0;
            var task_id = timer.data('task-id');
            var is_paused = timer.data('is-paused');
            var current_seconds = timer.data('current-seconds');
            var last_modified_timestamp = timer.data('last-modified-timestamp');
            var is_started = last_modified_timestamp > 0;
            var start = timer.data('start');
            var stop = timer.data('stop');
            var is_navtimer = timer.hasClass('navtimer');

            timer.addClass("js-processed-timer");

            if (is_navtimer) {
                timer.on('click', '.play', function() {
                    timer.find('.play').removeClass('play').addClass('stop').html(stop);
                    $('#task-row-'+task_id+' .the-task, #task-row-'+task_id+'.dashboard-task-item').addClass('hover');

                    var timer_start = $('.timer:not(.navtimer)[data-task-id='+task_id+'] .play');
                    if (timer_start.length > 0) {
                        // Just click the start button, it'll handle the rest.
                        timer_start.click();
                    } else {
                        // Submit the GET yourself.
                        //show_loading_modal(__("tasks:starting_timer"));
                        $.get(baseURL + 'admin/projects/times/timers_play/' + task_id + '/' + current_timestamp()).always(function() {
                            window.location.reload();
                        });
                    }
                });

                timer.on('click', '.stop', function() {
                    timer.find('.stop').removeClass('stop').addClass('play').html(start);
                    $('#task-row-'+task_id+' .the-task, #task-row-'+task_id+'.dashboard-task-item').removeClass('hover');
                    var timer_stop = $('.timer:not(.navtimer)[data-task-id='+task_id+'] .stop');
                    if (timer_stop.length > 0) {
                        // Just click the stop button, it'll handle the rest.
                        timer_stop.click();
                    } else {
                        // Submit the GET yourself.
                        //show_loading_modal(__("tasks:stopping_timer"));
                        $.get(baseURL + 'admin/projects/times/timers_stop/' + task_id + '/' + current_timestamp()).always(function() {
                            window.location.reload();
                        });
                    }
                });
            } else {
                if (is_started) {
                    timer.find('.play').removeClass(is_paused ? 'pause' : 'play').addClass(is_paused ? 'play' : 'pause');

                    if (!is_paused) {
                        update_timer(timer, current_seconds, last_modified_timestamp);
                        timer_interval = setInterval(function() {
                            update_timer(timer, current_seconds, last_modified_timestamp);
                        }, 1000);
                        timer.find('.time-ticker').addClass('running');
                    } else {
                        update_timer(timer, current_seconds, current_timestamp());
                    }
                }

                timer.on('click', '.play', function() {
                    timer.find('.play').removeClass('play').addClass('pause');
                    last_modified_timestamp = current_timestamp();

                    timer_interval = setInterval(function() {
                        update_timer(timer, current_seconds, last_modified_timestamp);
                    }, 1000);
                    //show_loading_modal(__("tasks:starting_timer"));
                    $.get(baseURL + 'admin/projects/times/timers_play/' + task_id + '/' + current_timestamp()).always(function() {
                        window.location.reload();
                    });
                    timer.find('.time-ticker').addClass('running');
                    return false;
                });

                timer.on('click', '.pause', function() {
                    clearInterval(timer_interval);
                    current_seconds = current_seconds + (current_timestamp() - last_modified_timestamp);
                    timer.find('.pause').removeClass('pause').addClass('play');
                    timer.find('.time-ticker').removeClass('running');
                    $.get(baseURL + 'admin/projects/times/timers_pause/' + task_id + '/' + current_timestamp());
                    return false;
                });

                timer.on('click', '.stop', function() {
                    clearInterval(timer_interval);
                    timer.find('.pause').removeClass('pause').addClass('play');
                    timer.find('.time-ticker').removeClass('running');
                    current_seconds = 0;
                    update_timer(timer, current_seconds, current_timestamp());
                    //show_loading_modal(__("tasks:stopping_timer"));
                    $.get(baseURL + 'admin/projects/times/timers_stop/' + task_id + '/' + current_timestamp()).always(function() {
                        window.location.reload();
                    });
                    return false;
                });
            }

        });
    };

})(jQuery);

function process_import_table() {

    var records = [];

    $('#importer-table tbody tr').each(function() {
	var buffer = {};
	$(this).find('td').each(function() {
	    var field = $(this).data('field');
	    var value = $(this).data('real_value');
	    value = (value == undefined) ? '' : value;

	    if (field == 'currency_id') {
		value = $(this).find('select').val();
	    }

	    buffer[field] = value;

	});

	records.push(buffer);
    });

    return records;

}

function close_reveal(callback) {
    $('.reveal-modal:visible').bind('reveal:closed.reveal', callback).trigger('reveal:close');
}

function on_close_reveal(callback) {
    $('#arbitrary-modal').bind('reveal:closed.reveal', callback);
}

function on_load_reveal(callback) {
    $('#arbitrary-modal').bind('loaded_pancake_reveal', callback);
}

function facebox_with_loading_image(url) {
    open_reveal(url);
}

function show_loading_modal(verb_ing) {
    if (typeof verb_ing === 'undefined') {
        verb_ing = 'loading';
    }

    verb_ing += '';
    verb_ing = verb_ing.charAt(0).toUpperCase() + verb_ing.substr(1);
    $('#arbitrary-modal-loading .verb-ing').text(verb_ing);
    $('#arbitrary-modal-loading').reveal();
}

function open_reveal(html_element_or_url, options) {
    var $arbitrary_modal = $('#arbitrary-modal');
    var add_close_button = function () {
        var has_close = ($arbitrary_modal.find(".close-reveal-modal").length > 0);

        if (!has_close) {
            $arbitrary_modal.append('<a class="close-reveal-modal">&#215;</a>');
        }
    };

    if (typeof options === "undefined") {
        options = {};
    }

    if (typeof options.closeOnBackgroundClick === "undefined") {
        options.closeOnBackgroundClick = false;
    }

    if ($('.reveal-modal:visible').length > 0) {
        close_reveal(function () {
            open_reveal(html_element_or_url, options);
        });
        return;
    }

    if (typeof(html_element_or_url) === 'string' && html_element_or_url.substr(0, 4) === 'http') {
        $arbitrary_modal.html("<h2 style='text-align: center;padding: 40px 0;'>Loading, please wait...</h2>");

        $.get(html_element_or_url, function (data) {
            $arbitrary_modal.html(data).trigger('loaded_pancake_reveal');
            add_close_button();
        });

        $arbitrary_modal.reveal(options);
    } else {
        $arbitrary_modal.find('.modal-content').html(html_element_or_url);
        add_close_button();
        $arbitrary_modal.reveal(options);
    }
}

function add_hours() {
    $('#add_hours_container').reveal();
    return false;
}

function save_hours() {
    var add_hours = $('#arbitrary-modal #add_hours_container');
    var hours = add_hours.find('[name=hours]').val();
    var date = $('#arbitrary-modal .hasDatepicker').datepicker('getDate').getTime() / 1000;
    var task = add_hours.find('[name=task_id]').val();
    var notes = add_hours.find('[name=note]').val();
    var project_id = add_hours.find('.invoice-block').data('project-id');
    $.post(submit_hours_url, {
        hours: hours,
        date: date,
        task: task,
        notes: notes,
        project_id: project_id
    }, function(response) {
        window.location.reload();
    });
    close_reveal();
}

function submit_import() {
    $.post(submit_import_url, {'records[]': process_import_table()}, function(data) {

    }, 'json');
}

$(document).on("click", "a#qm", function () {
    $("#drop1").toggle("fast");
    $("a#qm").toggleClass("active");
});

$(document).on("click", ".js-start-edit-time-entry", function(event) {
    event.preventDefault();
    start_edit_time($(this).data("entry-id"));
});

$(document).on('click', '.complete-check', function (event) {
    Tasks.toggleStatus($(this).data('task-id'), !$(this).is('.checked'));
    $(this).toggleClass('checked');
    if ($(this).is('.checked') && $(this).parents("div.dashboard-task").find(".pause.timer-button").length > 0) {
        $(this).parents("div.dashboard-task").find(".stop.timer-button").click();
    }
    event.preventDefault();
});

$(document).on('mouseover', '.more-actions', function() {
    var win = $(window);
    var el = $(this).is('ul') ? $(this) : $(this).find('ul');
    var winPos = win.scrollTop() + win.height();
    var elPos = el.offset().top + el.height();

    if( winPos <= elPos ) {
	// Send it above the gear icon.
	$(this).find('ul').css('top', -$('.more-actions ul:visible').height());
	$(this).find('.gear').addClass('top-menu');
    }
});

function update_parent(el) {
    var select_val = el.find('select').val();
    var generate_val = el.find('.generate').is(':checked') ? 1 : 0;
    var send_val = el.find('.send').is(':checked') ? 1 : 0;

    generate_val = generate_val || '0';
    send_val = send_val || '0';

    var new_val = select_val + generate_val + send_val;

    el.find('.value').val(new_val);
}

$(document).on('change', '.parent-module select, .parent-module input', function() {
    update_parent($(this).parents('.parent-module'));
});

$(document).on('change', '.parent-module select', function() {
    if ($(this).val() != "000") {
        $(this).parents('.assigned_user').find('.permissions_breakdown').show();
    } else {
        $(this).parents('.assigned_user').find('.permissions_breakdown').hide();
    }
});

$(document).on('submit', '.confirm-form', function(e) {
    e.preventDefault();
    if (confirm('Are you sure?'))
    {
        $(this).unbind(e);
        $(this).submit();
    }
    return false;
});

$(document).on("click", ".js-fake-submit-button", function(event) {
    event.preventDefault();
    $(this).parents("form").submit();
});

$(document).on("change", ".js-submit-on-change", function(event) {
    $(this).parents("form").submit();
});

$(document).on("click", ".js-delete-task", function(event) {
    event.preventDefault();
    $('#delete-task-'+$(this).data("task-id")).submit();
});

$(document).on('click', '.confirm-delete', function(e) {
    e.preventDefault();
    return confirm('Are you sure?');
});


$(document).on('mouseout', '.more-actions', function() {
    $(this).find('ul').css('top', '37px');
    $(this).find('.gear').removeClass('top-menu');
});

$(document).on('change', '.import-currency-selector select', function() {
    $('.import-field select').change();
});

$(document).on('change', '.import-field select', function() {

    var field = $(this).val();

    if (field == 'na' || field == 'select') {
		return;
    }

    // 1. If any other fields already have been matched to this field, reset them, BUT ONLY IF THEY'RE NOT THE CURRENT ELEMENT

    var matched  = $('.matched-'+field);
    var this_is_matched = $(this).parents('.import-field').hasClass('matched-'+field);

    if (matched.length > 0) {
		if (matched.length == 1 && this_is_matched) {
		    // don't do anything.
		} else {
		    matched.each(function() {
			$(this).removeClass('matched-'+field).data('matched', '');
			$(this).find('select').val('select').change();
		    });
		}
    }

    var import_field = $(this).parents('.import-field');

    // 2. If this field has already been matched to a row, empty that row.
    if (import_field.data('matched') != undefined && import_field.data('matched') != '' && import_field.data('matched') != 'currency_id') {
	$('table.records td.field-'+import_field.data('matched')).each(function() {
	    $(this).html('');
	});
	import_field.removeClass('matched-'+import_field.data('matched')).data('matched', '');
    }

    import_field.addClass('matched-'+field).data('matched', field);

    var original_field = import_field.data('field');

    $.each($('table.records td.field-'+field), function(i, obj) {

	obj = $(obj);
	var value = records[i][original_field];
	var real_value = value;
	var currency = obj.parents('tr').find('td.field-currency_id').find('span').html();

	switch (field) {
	    case 'invoice_number':
		real_value = ltrim(value, '0');
		value = '#'+real_value;
		break;
	    case 'amount':
		real_value = round(value, 2);
		value = currency+real_value;
		break;
	    case 'amount_paid':
		real_value = round(value, 2);
		value = currency+real_value;
		break;
	    case 'payment_date':
		real_value = strtotime(value);
		value = strtotime(value) == 0 ? '-' : date(php_date_format, real_value);
		break;
	    case 'date_entered':
		real_value = strtotime(value);
		value = strtotime(value) == 0 ? '' : date(php_date_format, real_value);
		break;
	    case 'currency_id':
		if (value.length == 3) {
		    value = value.toUpperCase();
		    real_value = value;
		    if (obj.find('[value='+value+']').length > 0) {
			obj.data('real_value', real_value);
			$(this).find('select').val(value).change();
		    }
		}
		break;
	}

	if (field != 'currency_id') {
	    obj.html(value);
	    obj.data('real_value', real_value);
	}
    });

    $('table.records').show();

});

$('a.mark-as-sent').live('click', function () {
    var unique_id = $(this).data('invoice-unique-id');
    var module = "invoices";

    if (typeof(unique_id) === "undefined") {
        var $parent = $(this).parents('[data-unique-id]');
        unique_id = $parent.data("unique-id");
        module = $parent.data("module");
    }

    $.get(baseURL + 'ajax/mark_as_sent/' + module + '/' + unique_id, function () {
        $('#main').load(window.location.href + ' #main');
    });
    return false;
});

function get_widest_width(elements) {
    var widest = null;
    $(elements).each(function() {
      if (widest == null)
	widest = $(this);
      else
      if ($(this).width() > widest.width())
	widest = $(this);
    });

    return widest.width();
}

function start_edit_time(id) {
    $('.view_entries_table').fadeOut(function() {
        $('.edit-entry-'+id).show();
        $('.edit-entry-'+id+' .js-livedisplay-time').trigger('input');
    });
}

function setDateValue(currentDateBtn) {
    var date = $('#date');
    var day = $('#date-day');

    switch (currentDateBtn) {
        case 'date-today':
            date.addClass('hide');
            day.val('today');
            break;
        case 'date-yesterday':
            date.addClass('hide');
            day.val('yesterday');
            break;
        case 'date-other':
            date.removeClass('hide');
            day.val('other');
            break;
    }
}

function hide_notification(notification_id) {
    $.get(baseURL+'ajax/hide_notification/'+notification_id);
}

$('.gateway .enabled').live('click', function() {
    if ($(this).is(':checked')) {
	$(this).parents('.gateway').find('.gateway-fields').slideDown();
    } else {
	$(this).parents('.gateway').find('.gateway-fields').slideUp();
    }
});

$.fn.forceNumeric = function () {
    return this.each(function () {

        $(this).keydown(function() {$(this).data('old-val', $(this).val())}).keyup(function() {
            if ($(this).data('old-val') != $(this).val() && $(this).val().replace(/[^0-9\-\.]/g, '') != $(this).val()) {
                $(this).val($(this).val().replace(/[^0-9\-\.]/g, ''));
            }
        });
    });
};

$.fn.force_numeric_or_percentage = function () {
    return this.each(function () {
        $(this).keydown(function() {$(this).data('old-val', $(this).val())}).keyup(function() {
            if ($(this).data('old-val') != $(this).val() && $(this).val().replace(/[^0-9\-\.%]/g, '') != $(this).val()) {
                $(this).val($(this).val().replace(/[^0-9\-\.%]/g, ''));
            }
        });
    });
};

$(function(){

    $('.gateway .enabled:not(:checked)').parents('.gateway').find('.gateway-fields').hide();

	if ($.livequery != undefined) {


	    $('label.use-label').livequery(function() {
		var placeholder = $(this).hide().html();
		var input = $('#'+$(this).attr('for')).addClass('placeholded-input');
		if (input.length != 0) {
		    var div = $('<div style="position:relative;float:left;" class="placeholded-input-container"></div>');
		    input.before(div);
		    div.append(input);
		    var placeholderel = $('<div class="placeholder">'+placeholder+'</div>');
		    input.before(placeholderel);
		    placeholderel.click(function() {$(this).siblings('.placeholded-input').focus();return false;})
		    input.css('padding-left', placeholderel.width() + 10);
		}
	    });

	    $('.numeric').livequery(function() {
			$(this).forceNumeric();
		});

	    $('.colorPicker').livequery(function () {
			//$(this).miniColors();
            $.minicolors.init();
		});


	    $('.datePicker').livequery(function () {
			$(this).datepicker({
				dateFormat: datePickerFormat
			});
		});

        $('.timePicker').livequery(function(){
            $(this).timePicker({
                show24Hours: use_24_hours,
                step: 15
            });
        });

	}

	setTimeout(function() {$('.fadeable').css('overflow', 'hidden').slideUp(1000);}, 5000);

    $('a.modal').live('click', function (event) {
        event.preventDefault();
        open_reveal($(this).attr('href'));
    });

        $('body').on('click', '#add_hours', add_hours);
        $('body').on('keypress', '#add_hours_container input, #add_hours_container textarea', function(ev) {
            var keycode = (ev.keyCode ? ev.keyCode : ev.which);
            if (keycode == '13') {
                save_hours();
            }
        });
        $('body').on('click', '#add_hours_container .submit_hours', save_hours);

	$('a.contact.phone, a.contact.mobile').each(function() {

		$link = $(this);

		type = $link.hasClass('phone') ? 'phone' : 'mobile';

		$link
			.attr('href', baseURL+'admin/clients/call/'+$(this).data('client')+'/'+type)
			.live('click', function() {
                            open_reveal($(this).attr('href'))
                        });
	});

});

Tasks = {

	timer_intervals: [],

    toggleStatus: function(id, is_checked)
    {
        if ($('#task-row-'+id).length === 0) {
            // This error should never happen to non-developer users.
            // But it serves to highlight when a developer breaks this functionality.
            alert("ERROR: Did not find a '"+'#task-row-'+id+"' element, so updating the task's status is not possible.");
            return;
        }

        var $task_row = $('#task-row-'+id);
        var is_dashboard_row = $task_row.hasClass('dashboard-task-item');

        if (is_checked) {
            $task_row.find('.js-task-complete-status').addClass('completed');
        } else {
            $task_row.find('.js-task-complete-status').removeClass('completed');
        }

        $.get(site_url('admin/projects/tasks/set_status/' + (is_checked ? 'true' : 'false') + '/' + (is_dashboard_row ? 'true' : 'false') + '/' + id) + ' #task-row-' + id + ' > *', function () {
            if (is_dashboard_row) {
                $task_row.remove();
            }
        });
    }

};


function refreshTrackedHours(element) {
    var task_id = element.data('task-id');
    $.get(refreshTrackedHoursUrl+'/'+task_id, function(data) {
        element.html(data);
    });
}

$(function() {

        $('#notes,.ticket_comment, .redactor').redactor(redactor_options);

        $('.timer').timer();

	// Enable/Disable table action buttons
	$('input[name="action_to[]"], .check-all').live('click', function () {
		var check_all		= $(this),
			all_checkbox	= $(this).is('.grid-check-all')
				? $(this).parents(".list-items").find(".grid input[type='checkbox']")
				: $(this).parents("table").find("tbody input[type='checkbox']");

		all_checkbox.each(function () {
			if (check_all.is(":checked") && ! $(this).is(':checked'))
			{
				$(this).click();
			}
			else if ( ! check_all.is(":checked") && $(this).is(':checked'))
			{
				$(this).click();
			}
		});
	});
});


$('.notestoggle').on("click", function(e) {
  $( e.target ).closest('.notesarea').toggle();
});


$('.toggle-deleted').live('click',function(ev){
    $( ev.target ).closest('table').find('tr.deleted').toggle().toggleClass('hide');
});

$(document).on('click', '.js-toggle-deleted', function() {
    $(this).parent().find('tr.deleted').toggle().toggleClass('hide');
});


$('.task-notes-link').on("click", function(e) {
  $( e.target ).closest('.task-notes').toggle();
});



$(document).on('click', '.store-plugin', function(event) {
    if (!$(event.srcElement).is('a')) {
        window.location.href = $(this).data('href');
    }
});

$(document).on('click', '.js-process-filters', function processFilters(event) {
    var from = $('.from.datePicker').datepicker("getDate");
    var to = $('.to.datePicker').datepicker("getDate");
    var report_string, client, business;

    event.preventDefault();

    to.setDate(to.getDate() + 1);
    to.setTime(to.getTime() - 1000);

    from.setDate(from.getDate() + 1);
    from.setTime(from.getTime() - 1000);

    from = (from ? from.getTime() / 1000 : 0);
    to = to ? to.getTime() / 1000 : 0;

    if (to < from) {
        to = from;
    }

    client = $('select[name="client_id"]').val();
    business = $('select[name="business_identity_id"]').val();
    report_string = 'from;' + from + '-to;' + to;

    if (client > 0) {
        report_string += '-client;' + client;
    }

    if (business > 0) {
        report_string += '-business;' + business;
    }

    window.location.replace(site_url('admin/reports/all/' + report_string));
});

/**
 * Imports
 */

function reprocess(el) {
    var layout = el.find('.import_layout').val();
    var field = el.data('field');
    var regex = /{(.*?)}/gi;
    var original_vs = {};

    el.find('.reformat').hide();

    if (layout !== '') {

        var fields = layout.match(regex);
        var accurate_fields = {};
        if (fields) {
            $.each(fields, function(i, v) {
                v = v.replace('{', '').replace('}', '');
                var original_v = v;

                $.each(import_data.records[current_row - 1], function(v2, value) {
                    if (v2.toLowerCase() === v.toLowerCase()) {
                        v = v2;
                    }
                });

                original_vs[v] = original_v;
                accurate_fields[v] = v;
            });

            $.each(accurate_fields, function(v) {
                el.find('.reformat[data-csv-field="' + v + '"]').show();
            });

        }


        $.each(processed_import_data, function(k, record) {

            var layout_buffer = layout;

            $.each(accurate_fields, function(i, v) {

                var value = import_data.records[k][v];

                if (typeof value !== 'undefined') {
                    var reformat = el.find('[data-csv-field="' + v + '"] .import_reformat').val();

                    if (value === null) {
                        value = '';
                    }

                    switch (reformat) {
                        case 'use_first_word':
                            value = value.split(' ')[0];
                            break;
                        case 'use_all_but_first_word':
                            value = value.substr(value.split(' ')[0].length + 1);
                        case 'multiply_by_100':
                            var regex = /([0-9]+(?:\.[0-9]+)?)/;
                            var matches = value.match(regex);
                            value = matches === null ? 0 : parseFloat(matches[0]).toFixed(2);
                            value = value * 100;
                            break;
                    }

                    layout_buffer = layout_buffer.split('{' + original_vs[v] + '}').join(value);

                }
            });

            processed_import_data[k][field] = layout_buffer;

        });

        load(current_row);
    } else {
        $.each(processed_import_data, function(k, record) {
            processed_import_data[k][field] = '';
        });


        load(current_row);
    }
}

function store_processed_import_data() {

    var data = {};

    $('.pancake_field').each(function() {
        var field = $(this).data('field');
        var layout =
                data[field] = {
            layout: $(this).find('.import_layout').val(),
            translation: $(this).find('.import_translation').val(),
            reformats: {}
        };

        $(this).find('.field_details.reformat:visible').each(function() {
            data[field].reformats[$(this).data('csv-field')] = $(this).find('select').val();
        });

    });

    $('.processed_field_data').val(JSON.stringify(data));
    $('.processed_import_data').val(JSON.stringify(processed_import_data));
}

function makeMilestonesSortable() {
    var $list = $(".sortable-milestones");

    $list.sortable({
        items: '> .sortable-milestone',
        placeholder: 'empty',
        forcePlaceholderSize: true,
        stop: function(event, ui) {

            var $dragged_milestone = ui.item;
            var previous_milestone_id = $dragged_milestone.prev().data("milestone-id");
            if (!previous_milestone_id) {
                var $milestone = $(".project-tasks > [data-milestone-id='"+$dragged_milestone.data("milestone-id")+"']");
                $(".project-tasks > .milestone").not($milestone).first().before($milestone);
            } else {
                $(".project-tasks > [data-milestone-id='"+previous_milestone_id+"']").after($(".project-tasks > [data-milestone-id='"+$dragged_milestone.data("milestone-id")+"']"));
            }

            var milestones_order = [];
            $list.find(".sortable-milestone").each(function() {
                milestones_order.push($(this).data("milestone-id"));
            });

            $.post(site_url("admin/projects/milestones/update_position"), {
                project_id: $list.data('project-id'),
                milestones_order: milestones_order
            }, function(data) {
                if (data !== "OK") {
                    alert("An unknown error occurred while trying to update this task. Please try again.");
                }
            }).fail(function() {
                alert("An unknown error occurred while trying to update this task. Please try again.");
            });
        }
    });
    $list.disableSelection();
}

function makeSortable() {
    var $lists = $(".project-tasks.container ol.sortable");

    $lists.sortable({
        items: '> li',
        connectWith: $lists,
        dropOnEmpty: true,
        placeholder: 'empty',
        forcePlaceholderSize: true,
        start: function() {
            $('.project-tasks.container').addClass('dragging');
        },
        stop: function(event, ui) {
            $('.project-tasks.container').removeClass('dragging');
            var $item_li = ui.item;
            var $item_the_task = $item_li.find('> .dashboard-task');
            var $parent_task_ol = $item_li.parents('.sortable.task');
            var $parent_milestone_ol = $item_li.parents('.sortable.milestone');
            var $parent_not_milestone_ol = $item_li.parents('.sortable.not-milestone');
            var task_id = $item_the_task.find('.complete-check').data('task-id');

            if ($parent_task_ol.length > 0) {
                $item_the_task.find(".complete-checkbox-container").addClass("offset-by-one");
                $item_the_task.find(".task-title-container").addClass("seven").removeClass("eight");
            } else {
                $item_the_task.find(".complete-checkbox-container").removeClass("offset-by-one");
                $item_the_task.find(".task-title-container").addClass("eight").removeClass("seven");
            }

            var tasks_order = [];
            $('.task-item[id]').each(function() {
                tasks_order.push($(this).attr("id").replace("task-row-", ""));
            });

            var parent_id = 0;
            var milestone_id = 0;
            var border_color = '';

            if ($parent_task_ol.length > 0) {
                parent_id = $parent_task_ol.data('task-id');
            }

            if ($parent_milestone_ol.length > 0) {
                milestone_id = $parent_milestone_ol.data('milestone-id');
                border_color = $parent_milestone_ol.data('border-color');
            }

            if (parent_id > 0) {
                $item_li.data('parent-id', parent_id);
            } else {
                $item_li.data('parent-id', 0);
            }

            $('.sortable.has-tasks').filter(function() {
                return $(this).children('li').length === 0;
            }).removeClass("has-tasks").addClass("not-has-tasks");

            $('.sortable.not-has-tasks').filter(function() {
                return $(this).children('li').length > 0;
            }).removeClass("not-has-tasks").addClass("has-tasks");

            $.post(site_url("admin/projects/tasks/update_position"), {
                task_id: task_id,
                parent_id: parent_id,
                milestone_id: milestone_id,
                tasks_order: tasks_order
            }, function(data) {
                if (data !== "OK") {
                    alert("An unknown error occurred while trying to update this task. Please try again.");
                }
            }).fail(function() {
                alert("An unknown error occurred while trying to update this task. Please try again.");
            });
        }
    });
    $lists.disableSelection();
}

function process_time(value) {
    var time = Time.parse_time(value);
    var moment_clone;

    if (time.isValid()) {
        moment_clone = moment(time);
        moment_clone.startOf("day");
        return Math.abs(moment_clone.diff(time, 'hours', true));
    } else {
        return 0;
    }
}

function update_interpretation(field, value) {
    var is_valid = true;

    processed_import_data[current_row - 1][field] = value;

    if (value !== '') {
        switch (types[field]) {
            case 'email':
                var email_regex = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

                value = value.split(',');

                for (var i = 0, len = value.length, v; i < len; i++) {
                    value[i] = value[i].trim();
                    v = value[i];
                    if (!email_regex.test(v)) {
                        interpretation_els[field].addClass('invalid');
                        value = "Not a valid email address.";
                        is_valid = false;
                    }
                }

                if (is_valid) {
                    interpretation_els[field].removeClass('invalid');
                    value = value.join(", ");
                }

                interpretation_els[field].html(value);
                break;
            case 'url':
                var regex = /^\b((?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))$/i;
                if (regex.test(value)) {
                    interpretation_els[field].removeClass('invalid');
                } else {
                    interpretation_els[field].addClass('invalid');
                    value = "Not a valid URL.";
                }
                interpretation_els[field].html(value);
                break;
            case 'datetime':
                var date = Time.parse_date(value);
                if (date.isValid()) {
                    interpretation_els[field].removeClass('invalid');
                    value = date.format(momentjs_date_format);
                } else {
                    interpretation_els[field].addClass('invalid');
                    value = "Not a valid date.";
                }
                interpretation_els[field].html(value);
                break;
            case 'time':
                Time.update_time_display(value, interpretation_els[field]);

                if (import_type === 'time_entries') {
                    var hours = process_time(live_preview_els.end_time.val()) - process_time(live_preview_els.start_time.val());
                    if (hours > 0) {
                        hours = hours.toFixed(4);
                        live_preview_els.hours.val(hours);
                    }
                }
                break;
            case 'client':
                interpretation_els[field].addClass('neutral');

                var allow_create = true;
                if (typeof live_preview_els.client_id !== 'undefined' && typeof live_preview_els.project_id !== 'undefined') {
                    allow_create = false;
                }

                search_existing(value, interpretation_els[field], 'clients', field, 'client', allow_create, {}, ["project_id", "task_id"]);
                break;
            case 'task':
                interpretation_els[field].addClass('neutral');
                var data = {};

                if (typeof live_preview_els.client_id !== 'undefined') {
                    data.client_id = live_preview_els.client_id.val();
                }
                if (typeof live_preview_els.project_id !== 'undefined') {
                    data.project_id = live_preview_els.project_id.val();
                }

                search_existing(value, interpretation_els[field], 'tasks', field, 'task', true, data, ["project_id", "client_id"]);
                break;
            case 'user':
                interpretation_els[field].addClass('neutral');
                search_existing(value, interpretation_els[field], 'users', field, 'user', false);
                break;
            case 'gateway':
                interpretation_els[field].addClass('neutral');
                search_existing(value, interpretation_els[field], 'gateways', field, 'gateway', false);
                break;
            case 'currency':
                interpretation_els[field].addClass('neutral');
                search_existing(value, interpretation_els[field], 'currencies', field, 'currency', false);
                break;
            case 'project':
                interpretation_els[field].addClass('neutral');
                search_existing(value, interpretation_els[field], 'projects', field, 'project', false, {}, ["task_id", "client_id"]);
                break;
            case 'supplier':
                interpretation_els[field].addClass('neutral');
                search_existing(value, interpretation_els[field], 'suppliers', field, 'supplier', true);
                break;
            case 'category':
                interpretation_els[field].addClass('neutral');
                search_existing(value, interpretation_els[field], 'categories', field, 'category', true);
                break;
            case 'task_status':
                interpretation_els[field].addClass('neutral');
                search_existing(value, interpretation_els[field], 'task_statuses', field, 'task_status', false);
                break;
            case 'milestone':
                interpretation_els[field].addClass('neutral');
                search_existing(value, interpretation_els[field], 'milestones', field, 'milestone', false, {project: live_preview_els.project_id.val()});
                break;
            case 'boolean':
                var regex = /^(true|false|yes|no|1|0|y|n)$/i;
                var true_regex = /^(true|yes|1|y)$/i;
                var false_regex = /^(false|no|0|n)$/i;
                if (regex.test(value)) {
                    interpretation_els[field].removeClass('invalid');
                    value = true_regex.test(value) ? 'Yes' : "No";
                } else {
                    interpretation_els[field].addClass('invalid');
                    value = "Not a valid answer. Available options are: yes, no, true, false, 1, 0, y, n.";
                }
                interpretation_els[field].html(value);
                break;
            case 'number':
                var regex = /([0-9]+(?:\.[0-9]+)?)/;
                var matches = value.match(regex);
                if (matches === null) {
                    interpretation_els[field].addClass('invalid');
                    value = "Not a valid number.";
                } else {
                    interpretation_els[field].removeClass('invalid');
                    value = parseFloat(matches[0]).toFixed(2);
                }
                interpretation_els[field].html(value);
                break;
            case 'number_or_percentage':
                var regex = /([0-9]+(?:\.[0-9]+)?)(%?)/;
                var matches = value.match(regex);
                if (matches === null) {
                    interpretation_els[field].addClass('invalid');
                    value = "Not a valid number or percentage.";
                } else {
                    interpretation_els[field].removeClass('invalid');
                    value = parseFloat(matches[1]).toFixed(2) + matches[2];
                }
                interpretation_els[field].html(value);
                break;
            case 'hours':
                var regex = /([0-9]+(?:\.[0-9]+)?)/;
                var hours = 0;
                var minutes = 0;
                var seconds = 0;

                if (value.indexOf(':') !== -1) {
                    value = value.split(':');
                    value[0] = parseFloat(value[0]);
                    value[1] = parseFloat(value[1]);

                    value[0] = isNaN(value[0]) ? 0 : value[0];
                    value[1] = isNaN(value[1]) ? 0 : value[1];

                    hours = (value[0]) + ((value[1]) / 60);

                    if (typeof value[2] !== 'undefined') {
                        value[2] = parseFloat(value[2]);
                        value[2] = isNaN(value[2]) ? 0 : value[2];
                        hours = hours + ((value[2]) / 3600);
                    }

                    value = hours;
                } else {
                    var matches = value.match(regex);

                    if (matches === null) {
                        // Not a number.
                        value = "Not a valid format of hours. You can either type them as time (eg. 5:30, or 5:30:15) or as a number (eg. 5.5).";
                    } else {
                        value = parseFloat(matches[0]);
                    }
                }

                value = parseFloat(value.toFixed(4));
                hours = Math.floor(value);
                value = (value - hours) * 60;
                value = parseFloat(value.toFixed(4));
                minutes = Math.floor(value);
                value = (value - minutes) * 60;
                value = parseFloat(value.toFixed(4));
                seconds = Math.floor(value);
                minutes = minutes.toString();
                seconds = seconds.toString();

                if (minutes.length == 1) {
                    minutes = "0"+minutes;
                }

                if (seconds.length == 1) {
                    seconds = "0"+seconds;
                }

                interpretation_els[field].html(hours+':'+minutes+':'+seconds);
                break;
            case 'tax':

                var regex = /([0-9]+(?:\.[0-9]+)?)/;
                var matches = value.match(regex);

                if (matches === null) {
                    // It's text, search for that tax.
                    search_existing(value, interpretation_els[field], 'taxes', field, 'tax', false);
                } else if (value.indexOf('%') === -1) {
                    var item_name = (field.indexOf('1') !== -1) ? 'item_1_' : 'item_2_';
                    var rate = parse_number(live_preview_els[item_name+'rate'].val());
                    var quantity = parse_number(live_preview_els[item_name+'quantity'].val());
                    var total =  rate * quantity;

                    // It's an amount, convert to percentage.
                    value = ((parseFloat(matches[0])/total) * 100);
                    if (isNaN(value)) {
                        value = 0;
                    }
                    value = value.toFixed(2)+'%';
                    interpretation_els[field].html(value);
                } else {
                    interpretation_els[field].html(parse_number(value).toFixed(2)+'%');
                }
                break;
        }
    } else {
        interpretation_els[field].html("");
    }
}

function parse_number(value, default_value) {

    var matches = ('' + value).match(/([0-9]+(?:\.[0-9]+)?)/);

    if (typeof default_value === 'undefined' || isNaN(default_value)) {
        default_value = 0;
    }

    return matches === null ? default_value : parseFloat(matches[0]);
}

function search_existing(query, load_el, import_type, field, singular, allow_create, extra_data, fields_to_refresh) {

    if (typeof allow_create === 'undefined') {
        allow_create = true;
    }

    if (typeof extra_data === 'undefined') {
        extra_data = {};
    }

    if (query == last_query) {
        // No need to do the same query again.
        return;
    } else {
        last_query = query;
    }

    load_el.html("Searching for similar "+import_type.split('_').join(' ')+"...");

    $.post(baseURL+'ajax/search_existing', {import_type: import_type, query: query, extra_data: extra_data}, function(data) {

        var status = '';
        var ul = '';
        var id_to_compare_to = 0;

        if (data.length > 0) {
            if (data[0].levenshtein > 0) {
                if (allow_create) {
                    status = "<p class='existing_interpretation_status will_create'>As it is, Pancake will create a new "+singular+" named "+query+".</p>";
                } else {
                    status = "<p class='existing_interpretation_status will_create'>This "+singular+" does not exist.</p>";
                }
                ul = status+"<p>Did you mean one of these?</p><ul>";
                $.each(data, function(id, key) {
                    ul = ul + "<li><a href='#' class='existing_input' data-field='"+field+"' data-value='"+key.name+"'>"+key.name+"</a></li>";
                });
                ul = ul + "</ul>";
            } else {
                id_to_compare_to = data[0].id;
                status = "<p class='existing_interpretation_status will_not_create'>As it is, Pancake will use the "+singular+" you entered.";
                if (singular === 'task') {
                    status += "<br><strong>Client:</strong> "+data[0].record.client;
                    status += "<br><strong>Project:</strong> "+data[0].record.project;
                }

                status += "</p>";
                ul = status;
            }
        } else {
           ul = "<p class='existing_interpretation_status will_create'>No "+import_type.split('_').join(' ')+" were found.</p>";
        }

        var existing_id = parseInt(load_el.data("existing-id"));
        if (existing_id !== id_to_compare_to) {
            load_el.data("existing-id", id_to_compare_to);
            if (fields_to_refresh) {
                $.each(fields_to_refresh, function(key, value) {
                    if (typeof live_preview_els[value] !== "undefined") {
                        live_preview_els[value].change();
                    }
                });
            }
        }

        load_el.html(ul);
    }, 'json').fail(function() {
        load_el.html("<p class='existing_interpretation_status will_create'>An unknown error occurred.</p>");
    });
}

function load(i) {

    var value = '';

    if (i > row_count || i < 1) {
        return false;
    }

    current_row = i;

    if (current_row === row_count) {
        $('.next.button').addClass('disabled');
    } else {
        $('.next.button').removeClass('disabled');
    }

    if (current_row === 1) {
        $('.back.button').addClass('disabled');
    } else {
        $('.back.button').removeClass('disabled');
    }

    $('.row_number').html(current_row);

    $.each(fields, function(i, field) {
        value = processed_import_data[current_row - 1][field];
        live_preview_els[field].val(value);
        update_interpretation(field, value);
    });

    return false;
}

$(document).on('submit', '#user-form', function on_submit_user_form() {

    var $form = $(this);
    var $submit_button_span = $('#user-form .blue-btn span');
    var $modal_form_holder = $form.parents('.modal-form-holder');

    if ($form.hasClass('disabled')) {
        return false;
    }

    $form.addClass('disabled');
    $submit_button_span.data('original', $submit_button_span.text()).text("Submitting, please wait...");

    $.post($form.attr('action'), $(this).serialize()).done(function(data) {
        $form.removeClass('disabled');
        try {
            data = JSON.parse(data);

            if (data.success) {
                window.location.href = data.href;
            } else {
                $submit_button_span.text($submit_button_span.data('original'));
                $modal_form_holder.replaceWith(data.html);
            }
        } catch (e) {
            $submit_button_span.text($submit_button_span.data('original'));
            alert(__('global:error_submitting_ajax'));
        }
    }).fail(function() {
        $submit_button_span.text($submit_button_span.data('original'));
        alert(__('global:error_submitting_ajax'));
    });
    return false;
});

$(document).on('click', '.upgrade-plugins-btn', function() {
    $(this).addClass('disabled').html($(this).data('loading-text'));
    $.get($(this).attr('href')).always(handle_update_result);
    return false;
});

if (pancake_demo) {
    $(document).on('click', '.buy', function() {
        open_reveal("<p>This is the demo, you can't purchase anything from the store.</p>");
        return false;
    });
}

$(document).on('click', '.buy-with-modal', function() {
    current_plugin_modal = $(this).attr('href');
});

$(document).on('click', '.install-with-modal', function() {
    $.get($(this).attr('href'), handle_update_result);
});

$(document).on('click', '.pancakeapp_cancel', function() {
    close_reveal();
});

$(document).on('click', '.download-free', function() {
    $('#download-free').reveal();
    $.get($(this).attr('href'), handle_buy_result, 'json');
    return false;
});

$(document).on('click', '.pancakeapp_submit', function() {
    var parent = $(this).parents('.reveal-modal');
    var password = parent.find('.pancakeapp_password').val();
    var email = parent.find('.pancakeapp_email').val();
    var new_html = '';

    $('#buy-with-modal-loading').reveal();

    $.post(current_plugin_modal, {
        email: email,
        password: password
    }, handle_buy_result, 'json');
    return false;
});

function handle_update_result(data) {
    if (data === "UPDATED") {
        window.location.reload(true);
    } else {
        alert("An unknown error occurred while trying to update. Refresh the page and try again. If the issue persists, contact Pancake Support.");
    }
}

function handle_buy_result(data) {
    new_html = "<p>" + data.reason + "</p>";

    if (data.success) {
        window.location.href = data.new_url;
        return;
    } else {
        if (data.redirect_to_pancake) {
            new_html += "<a href='" + data.new_url + "' class='blue-btn'>Go to pancakeapp.com</a>";
        } else {
            new_html += "<a href='#' class='pancakeapp_cancel blue-btn'>Close</a>";
        }
    }

    if (data.result_modal != '') {
        $('#'+data.result_modal).reveal();
        if (data.result_modal == 'already-purchased') {
            $.get(plugins_update_url, handle_update_result);
        }
    } else {
        $('#buy-with-modal-result').html(new_html).reveal();
    }

}

$(document).on('click', '.expand-email-template', function() {
    var $el = $(this);
    var $container = $el.parents('.email-template').find('.expandable-email-template-container');
    if ($container.hasClass('visible')) {
        $container.removeClass('visible').stop(true, false).slideUp();
        $el.find('a').text('[+]');
    } else {
        $container.addClass('visible').stop(true, false).slideDown();
        $el.find('a').text('[-]');
    }

    return false;
});

$(document).on('click', '.plugin-store-screenshot', function() {
    open_reveal($(this).find('img').clone());
    return false;
});

$(document).on('change', '.import_translation', function() {
    var el = $(this);
    var val = el.val();
    var pancake_field = el.parents('.pancake_field');

    if (val !== '0' && val !== '1') {
        pancake_field.find('.field_details.layout').hide();
        pancake_field.find('.import_layout').val('{' + val + '}').change();
    } else if (val === '0') {
        pancake_field.find('.field_details.layout').hide();
        pancake_field.find('.import_layout').val("").change();
    } else if (val === '1') {
        pancake_field.find('.field_details.layout').show();
    }
}).on('click', '.imports .next.button', function() {
    return load(current_row + 1);
}).on('click', '.imports .back.button', function() {
    return load(current_row - 1);
}).on('change', '.import_reformat', function() {
    reprocess($(this).parents('.pancake_field'));
}).on('change keyup keydown', '.import_layout', function() {
    reprocess($(this).parents('.pancake_field'));
}).on('change keyup', '.live_preview_field', function() {
    var field = $(this).data('pancake-field');
    var value = $(this).val();
    update_interpretation(field, value);
}).on('click', '.layout_help_link', function() {
    open_reveal($('.imports_layout_help'));
    return false;
}).on('click', '.imports_form button', function() {
    store_processed_import_data();
}).on('click', '.existing_input', function() {
    var el = $(this);
    var field = el.data('field');
    var value = el.data('value');
    live_preview_els[field].val(value);
    update_interpretation(field, value);
    return false;
}).on('click', '.dont-show-this-again', function() {
    hide_notification('import_tutorial');
    $(this).parents('.import_notification').slideUp(function() {
        $(this).remove();
    });
});

/**
 * End Imports
 */

$(document).ready(function() {
    if ($('ol.project-tasks').length > 0) {
        makeSortable();
        makeMilestonesSortable();
    }
});

$(document).on('submit', '.task-quickadd', function(event) {
    var $task_quickadd = $(this);
    if (!$task_quickadd.data('is_submitting')) {
        $task_quickadd.data('is_submitting', true);
        var $name = $task_quickadd.find('.task-quickadd-name');
        var $milestone_id = $task_quickadd.find('[name=milestone_id]');

        var $new_task = $('#new_task');

        var $assigned_user_id = $task_quickadd.find('[name=assigned_user_id]');
        var data = {};


        if ($name.length === 0) {
            alert("No '.task-quickadd-name' was found for this '.task-quickadd' form!");
        }

        data.name = $name.val();
        data.project_id = $task_quickadd.data('project-id');

        if (data.name === '') {
            // No data was entered.
            return;
        }

        if ($milestone_id.length > 0) {
            data.milestone_id = $milestone_id.val();
        }

        if ($assigned_user_id.length > 0) {
            data.assigned_user_id = $assigned_user_id.val();
        }

        $task_quickadd.trigger("reset");
        //$(".project-tasks.container").append("<p>Adding task...</p>");

        $.post($task_quickadd.attr('action'), data).always(function(data) {
            $task_quickadd.data('is_submitting', false);
            if (data === 'OK') {

                if($new_task.length > 0) {
                    //alert('New Task');
                   location.reload();
                }
                $('.project-tasks-jquery-load-container').load(window.location.href+' .project-tasks.container', function() {
                    $('.timer').timer();
                });
            } else {
                alert("An unknown error occurred while trying to save your new task. Please try again.");
            }
        });
    }
    return false;
});

$(document).on('click', '.project-task-filter', function() {
    $('.project-task-filter.current').removeClass("current");
    var $filter = $(this).addClass("current");

    if ($filter.is('#no-filter')) {
        $('.task-item').slideDown(250);
    } else {
        var $to_hide = $('.task-item:not(.'+$filter.data('filter')+')');
        var $to_show = $('.task-item.'+$filter.data('filter'));

        // If any of the $to_show elements is a sub-task,
        // Add its parent task so it shows as well
        $to_show.each(function() {
            var $el = $(this);

            if ($el.is('.sub-task-item')) {
                var $parent_task = $('#task-row-'+$el.data('parent-id'));
                $to_show = $to_show.add($parent_task);
                $to_hide = $to_hide.not($parent_task);
            }
        });

        $to_hide.slideUp(250);
        $to_show.slideDown(250);
    }

    return false;
});

$("#no-filter").click(function() {
    $(".task-row").slideDown(800);
    $("#no-filter a").removeClass("current");
    $(this).addClass("current");
    return false;
});

$(".filter").click(function() {
    var thisFilter = $(this).attr("id");
    $(".task-row").slideUp(800);
    $("." + thisFilter).slideDown(800);
    $("#no-filter a").removeClass("current");
    $(this).addClass("current");
    return false;
});

$(document).on('click', '.open-timer-app', function() {
    window.open($(this).attr('href'), "timer-app", "height=197,width=1025");
    return false;
});

$(document).on('click', '.archive-ticket-button, .unarchive-ticket-button', function() {
    if ($(this).is(".archive-ticket-button")) {
        show_loading_modal(__("tickets:archiving_ticket"));
    } else {
        show_loading_modal(__("tickets:unarchiving_ticket"));
    }

    $.get($(this).attr('href')).always(function(data) {
        if (data === "SUCCESS") {
            window.location.href = site_url("admin/tickets");
        } else {
            alert(__("tickets:unknown_error_ticket_not_altered"));
        }
    });

    return false;
});

$(document).on('click', '.settings', function(event) {
    if ($(event.target).is('.settings')) {
        // Don't scroll up on click, which happens when you tap the link in mobile devices.
        return false;
    }
});

$(document).on('click', '.notification', function() {
    $(this).slideUp('fast', function() {
        $(this).remove();
    });
});

$(document).on('mouseenter mouseleave', '.the-task:not(.running-timer)', function(e) {
    $(this).toggleClass('hover');
});

$(document).on('click', '.export-btn', function() {
    var original_action = $('#settings-form').attr('action');
    $('#settings-form').attr('action', original_action + '/export').submit().attr('action', original_action);
    return false;
});

$(document).on('click', '.import-btn', function() {
    var original_action = $('#settings-form').attr('action');
    $('#settings-form').attr('action', original_action + '/import').submit().attr('action', original_action);
    return false;
});

$(document).on('click', '.remove-logo', function() {
    var $el = $(this);
    var $identity = $el.parents(".identity");

    $identity.find(".logo-business-identity").remove();
    $identity.find(".remove-logo-filename-input").val("1");
    $el.remove();

    return false;
});


// April 20th, 2014 //

$(document).on('click', '.task-toggle', function(e) {


    e.preventDefault();
    $('#'+$(this).data("task-note")).slideToggle("fast");
    $(this).find('.fa').toggleClass('fa-chevron-down').toggleClass('fa-chevron-up');



});

$(document).on('click', '.toggle-filter-entries', function() {
    var filter_entries = $(".filter-entries-container");

    if (filter_entries.is(":visible")) {
        filter_entries.slideUp();
    } else {
        filter_entries.slideDown();
    }

    return false;
});

$(document).on('click', '.js-submit-form', function() {
    $(this).parents('form').submit();
    return false;
});

function submit_edits($input) {
    var row = $input.parents('tr');

    var fail_ajax = function ($el) {
        alert(__('global:error_submitting_ajax'));
    };

    $input.hide().siblings('span').text($input.val()).show();

    $.post(site_url('admin/projects/times/ajax_set_entry'), {
        'id': row.data('id'),
        'start_time': $('.start_time input', row).val(),
        'end_time': $('.end_time input', row).val(),
        'date': $('.date input', row).datepicker("getDate").getTime()
    }, 'json').done(function (data) {
        if (data.success) {
            $('.duration span.value', row).text(data.new_duration);
            $('.js-rounded-duration', row).text(data.new_rounded_duration);
        } else {
            fail_ajax($input);
        }
    }).fail(function () {
        return fail_ajax($input);
    });
};

(function($) {

    function generate_label(options, checked_options, nothing_selected_label) {

        if (checked_options.length === 0) {
            return nothing_selected_label ? nothing_selected_label : __("global:na");
        }

        var label = [];
        $.each(checked_options, function(i, key) {
            label.push(options[key]);
        });

        label = label.join(", ");

        var pos = label.lastIndexOf(',');
        if (pos > -1) {
            label = label.substring(0,pos) + " " + __("global:and") + label.substring(pos+1);
        }

        return label;
    }

    function generate_dropdown(options, checked_options, label_width, nothing_selected_label) {
        var dropdown = '<div href="#" class="button multiselect-dropdown dropdown">';
        dropdown += "<span class='multiselect-label' style='width: " + label_width + "px;'>" + generate_label(options, checked_options, nothing_selected_label) + "</span>";
        dropdown += '<ul>';
        $.each(options, function (key, value) {
            dropdown += '<li><a data-value="' + key + '" href="#">' + (checked_options.indexOf("" + key) === -1 ? "" : '<span><i class="fi-check"></i> </span>') + value + '</a></li>';
        });
        dropdown += '</ul>';
        dropdown += '</div>';
        return dropdown;
    }

    $.fn.multiselect_destroy = function() {
        this.each(function() {
            var $el = $(this);
            var $container = $el.parents(".multiselect-container");
            $container.find(".multiselect-dropdown").remove();
            $el.unwrap().unwrap().removeClass("has-multiselect").show();
        });
    };

    $.fn.multiselect_update = function (values, trigger_change) {
        trigger_change = ((typeof trigger_change) === "undefined") ? true : trigger_change;

        this.each(function () {
            var $multiselect = $(this);
            var $container = $multiselect.parents(".multiselect-container");

            var options = $multiselect.data("multiselect-options");
            var checked_options = $multiselect.data("multiselect-checked-options");
            var needs_update = false;

            $.each(values, function (key, value) {
                values[key] = "" + value;
            });

            $.each(options, function (option) {
                option = "" + option;
                var checked_index = checked_options.indexOf(option);
                var is_currently_selected = checked_index !== -1;
                var should_be_selected = values.indexOf(option) !== -1;
                var $a = $container.find('.multiselect-dropdown a[data-value="' + option + '"]');

                if (is_currently_selected && !should_be_selected) {
                    var $span = $a.find("span");
                    $span.remove();
                    if (trigger_change) {
                        $multiselect.find('option[value="' + option + '"]').prop("selected", false);
                        $multiselect.trigger("change", [false]);
                    }
                    checked_options.splice(checked_index, 1);
                    needs_update = true;
                } else if (!is_currently_selected && should_be_selected) {
                    $a.prepend('<span><i class="fi-check"></i> </span>');
                    if (trigger_change) {
                        $multiselect.find('option[value="' + option + '"]').prop("selected", true);
                        $multiselect.trigger("change", [false]);
                    }
                    checked_options.push(option);
                    needs_update = true;
                }
            });

            if (needs_update || !trigger_change) {
                $container.find(".multiselect-label").html(generate_label(options, checked_options, $multiselect.data('nothing-selected-label')));
            }
        });
    };

    $.fn.multiselect = function() {
        this.each(function() {
            var $el = $(this);

            // Has already gotten multiselect.
            if ($el.hasClass("has-multiselect")) {
                return;
            }

            $el.addClass("has-multiselect").hide();
            var $options = $el.find("option");
            var options = {};
            var checked_options = [];
            $options.each(function() {
                var $option = $(this);
                var val = ("" + $option.val());
                options[val] = $option.text();
                if ($option.is(":checked")) {
                    checked_options.push(val);
                }
            });

            $el.data("multiselect-options", options);
            $el.data("multiselect-checked-options", checked_options);
            $el.wrap("<div class='multiselect-container'></div>").wrap('<span class="dropdown-arrow"></span>');

            var $container = $el.parents(".multiselect-container");
            var label_width = $container.width() - 30;

            $el.after(generate_dropdown(options, checked_options, label_width, $el.data('nothing-selected-label')));

            $el.on("input change", function (event, trigger_update) {
                var val = $(this).val();

                trigger_update = ((typeof trigger_update) === "undefined") ? true : trigger_update;

                if (val === null || typeof val === "undefined") {
                    val = [];
                }

                if (trigger_update) {
                    $el.multiselect_update(val, false);
                }
            });
            $container.on("click", ".multiselect-dropdown a", function() {
                var $multiselect = $(this).parents(".multiselect-container").find("select.multiselect");

                var value = ("" + $(this).data("value"));
                var checked_options = $multiselect.data("multiselect-checked-options").slice(0); // We use slice() to clone it so any changes don't affect the original.
                var checked_index = checked_options.indexOf(value);

                if (checked_index > -1) {
                    checked_options.splice(checked_index, 1);
                } else {
                    checked_options.push(value);
                }

                $($multiselect).multiselect_update(checked_options);
                return false;
            });
        });

        $(document).foundationButtons();
    };

})(jQuery);

$(document).ready(function() {
    $("select.multiselect").multiselect();

    $("table").on("click", ".checkbox-td", function(event) {
        if (!$(event.target).is('input')) {
            $(this).find('input').click();
        }
    });

});

$(document).ready(function () {
    if ($('.js-view-entries-page').length > 0) {
        $('.start_time span, .end_time span, .date span').on('click', function () {
            var $input = $(this).hide().siblings('input');
            $input.data("old-value", $input.val());
            $input.show().focus();
        });

        $('.date input').on('change', function (e) {
            var $input = $(this);
            if ($input.val() !== $input.data("old-value")) {
                submit_edits($input);
            }
        });

        $('.start_time input, .end_time input').on('blur change', function (e) {
            submit_edits($(this));
        });

        $('.delete-entry').click(function () {

            var row = $(this).closest('tr');
            var id = row.data('id');

            $.post(baseURL + 'admin/projects/times/ajax_delete_entry', {
                'id': row.data('id'),
            }, function () {
                row.slideUp('slow');
            });

            return false;
        });

        var currentDateBtn = $('.date-btn.current').attr('id');

        $('.date-btn').click(function (e) {
            e.preventDefault();

            var id = $(this).attr('id');
            if (currentDateBtn != id) {
                $('#' + currentDateBtn).removeClass('current');
                $(this).addClass('current');
                currentDateBtn = id;
            }

            setDateValue(currentDateBtn);
        });

        setDateValue(currentDateBtn);
    }
});

(function($, $document, Math, $window) {

    var $more_li = null, $not_more_li, $more, $more_dropdown, logo_width, settings_width, more_width, item_widths = [], is_more_link_visible = true;

    var hide_navbar_items = function(x) {
        var $move_to_more = $not_more_li.slice(-x).removeClass("js-not-more-li").addClass("js-more-li");
        $move_to_more.prependTo($more_dropdown);
        $more_li = $more_li.add($move_to_more);
        $not_more_li = $not_more_li.slice(0, -x);

        if ($more_li.length > 0 && !is_more_link_visible) {
            $more.show();
            is_more_link_visible = true;
        }
    };

    var show_navbar_items = function(x) {
        var $move_to_navbar = $more_li.slice(0, x).removeClass("js-more-li").addClass("js-not-more-li");
        $move_to_navbar.insertBefore($more);
        $not_more_li = $not_more_li.add($move_to_navbar);
        $more_li = $more_li.slice(x);

        if ($more_li.length === 0 && is_more_link_visible) {
            $more.hide();
            is_more_link_visible = false;
        }
    };

    var cache_navbar_base_links = function() {
        $('.more-link .js-generated').remove();
        $more_li = $(".js-more-li");
        $not_more_li = $(".js-not-more-li");
        $more = $(".more-link");
        $more_dropdown = $more.children(".dropdown");

        var $backend_logo = $('#backend-logo');
        var $header_logo = $backend_logo.find(".header-logo");
        $header_logo.width(parse_number($header_logo.css('max-width'), 0));
        logo_width = $backend_logo.outerWidth(true);
        $header_logo.css('width', 'auto').css('height', 'auto');
        more_width = $('.more-link').outerWidth(true);
        settings_width = $('.js-settings-dropdown').outerWidth(true);

        var number_of_more_items = $more_li.length;
        $more_li.hide();
        show_navbar_items(number_of_more_items);

        for (var i = 0; i < $not_more_li.length; i++) {
            item_widths.push($($not_more_li[i]).outerWidth(true));
        }

        hide_navbar_items(number_of_more_items);
        $more_li.show();
    };

    var resize_navbar = function() {
        var available_width = $window.width() - logo_width - settings_width - more_width;
        var items_that_fit = 0;
        for (var i = 0; i < item_widths.length; i++) {
            if (available_width > 0) {
                available_width -= item_widths[i];
                if (available_width > 0) {
                    items_that_fit++;
                }
            }
        }

        var change = $not_more_li.length - items_that_fit;
        if (change > 0) {
            hide_navbar_items(change);
        } else if (change < 0) {
            show_navbar_items(Math.abs(change));
        }
    };

    if (window.matchMedia("(min-width: 941px)").matches) {
        $document.ready(cache_navbar_base_links);
        $window.on('resize', resize_navbar);
        $document.on('ready', resize_navbar);
    }
})(jQuery, $(document), Math, $(window));

(function($, $document, Math, $window) {

    var $items = null, item_count = null, max_height = null;

    function resize_settings_menu() {
        if ($items === null) {
            $items = $('.js-settings-dropdown > li li:not(.js-generated)');
            item_count = $items.length;
            max_height = Math.max.apply(null, $items.map(function() {
                return $(this).outerHeight(true);
            }).get());
        }

        var number_of_items_to_show = Math.floor($window.height() / max_height);
        var number_of_items_to_hide = item_count - number_of_items_to_show;
        $items.show();
        if (number_of_items_to_hide > 0) {
            $items.not(':last').slice(-number_of_items_to_hide).hide();
        }
    };

    $document.on('mouseenter', '.js-settings-dropdown .has-dropdown', resize_settings_menu);
})(jQuery, $(document), Math, $(window));


$(document).on('change, keyup', '.js-payment-amount-input', function() {
    var amount = 0;
    $('.js-payment-amount-input').each(function() {
        amount += parse_number($(this).val());
    });

    $('.js-total-to-be-added').html(amount.toFixed(2));
});

$(document).on('click', '.js-add-custom-field', function(event) {
    $(".js-new-custom-field").clone().removeClass("js-new-custom-field").hide().appendTo(".js-custom-fields-container").slideDown();
    event.preventDefault();
    $(".js-remove-field").css("display", "inline-block");
});

$(document).on('click', '.js-remove-field', function(event) {
    if ($(".js-new-custom-field-container").length == 2) {
        $(".js-remove-field").css("display", "none");
    }
    $(this).parents(".js-new-custom-field-container").slideUp(function() {
        $(this).remove();
    });
    event.preventDefault();
});

$(document).on("click", ".report-buttons .js-report-error", function (event) {
    event.preventDefault();
    var $btn = $(this);
    if (!$btn.is(".success") && !$btn.is(".waiting")) {
        $btn.addClass("waiting").html(__("error:reporting"));
        $.getJSON($btn.attr("href")).done(function (data) {
            if (data.success) {
                $btn.removeClass("waiting").addClass("success").html(__("settings:error_reported"));
                if (typeof(data.email) !== "undefined") {
                    $btn.parents("tr").find(".details-container").append("<br /><br />" + __("error:response_will_be_sent_to_email").split("{email}").join(data.email));
                } else if (typeof(data.version) !== "undefined") {
                    $btn.parents("tr").find(".details-container").append("<br /><br />" + __("error:fixed_in_version").split("{version}").join(data.version));
                } else {
                    $btn.parents("tr").find(".details-container").append("<br /><br />" + __("error:already_being_dealt_with"));
                }
            } else {
                alert(data.error);
            }
        }).fail(function () {
            alert(__("error:unknown_error_reporting"));
        });
    }
});

$(document).on("click", ".js-verify-integrity", function (event) {
    var $btn = $(this), html = '', modified = '', deleted = '', ul = '', i = 0, max_files_to_list = 10;
    event.preventDefault();
    if (!$btn.is(".waiting")) {
        $btn.addClass("waiting").html(__("error:scanning"));
        $.getJSON($btn.attr("href")).done(function (data) {
            $btn.remove();
            if (data.success) {
                html = "<p>"+__("error:scan_result_success")+"</p>";
            } else {
                modified = __("error:scan_result_failure_modified_"+(data.modified_files == 1 ? "one" : "other"), {modified_files: data.modified_files})+":";
                deleted = __("error:scan_result_failure_deleted_"+(data.deleted_files == 1 ? "one" : "other"), {deleted_files: data.deleted_files})+":";

                html += "<h5>"+__("error:scan_result_failure_heading")+"</h5><ul>";

                if (data.modified_files > 0) {
                    ul = '<ul>';
                    i = 0;
                    $.each(data.failed_hashes, function(filename, action) {
                        if (i < max_files_to_list && action == "M") {
                            ul += '<li>'+filename+'</li>';
                        }

                        i++;
                    });

                    if (data.modified_files > max_files_to_list) {
                        ul += '<li>'+__("error:and_x_others", {x: data.modified_files - max_files_to_list})+'</li>';
                    }

                    ul += '</ul>';
                    html += "<li>"+modified+ul+"</li>";
                }

                if (data.deleted_files > 0) {
                    ul = '<ul>';
                    i = 0;
                    $.each(data.failed_hashes, function(filename, action) {
                        if (i < max_files_to_list && action == "D") {
                            ul += '<li>'+filename+'</li>';
                        }

                        i++;
                    });

                    if (data.deleted_files > max_files_to_list) {
                        ul += '<li>'+__("error:and_x_others", {x: data.deleted_files - max_files_to_list})+'</li>';
                    }

                    ul += '</ul>';
                    html += "<li>"+deleted+ul+"</li>";
                }

                html += "</ul><p>"+__("error:scan_result_failure_how_to_fix")+"</p><p><a href='"+pancakeapp_com_base_url+"faq/manual-update' target='_blank' class='btn'>"+__("error:click_here_for_instructions")+"</a></p>";
            }

            $(".js-integrity-result-container").html(html);
        }).fail(function () {
            alert(__("error:unknown_error_scanning"));
        });
    }
});

$(document).on("click", ".js-delete-error", function(event) {
    event.preventDefault();
    var $parent = $(this).parents("tr");
    $(this).html(__("error:deleting")).addClass("waiting");
    $.get($(this).attr("href")).done(function(data) {
        if (data == "OK") {
            $parent.remove();
        } else {
            alert(__("error:subtitle"));
        }
    }).fail(function() {
        alert(__("error:subtitle"));
    });
});
