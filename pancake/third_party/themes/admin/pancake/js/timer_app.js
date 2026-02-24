var current_task_id = 0;

$('#client').on('change', function() {
    var client_id = $(this).val();
    var new_options = $('#default-option-template').html();

    if (typeof projects_per_client[client_id] !== undefined) {
        $.each(projects_per_client_order[client_id], function(i, project_id) {
            new_options += "<option value='" + project_id + "'>" + projects_per_client[client_id][project_id] + "</option>";
        });
    }

    $('#project').html(new_options);
});

$('#project').on('change', function() {
    var project_id = $(this).val();
    var new_options = $('#default-option-template').html();

    if (typeof tasks_per_project[project_id] !== undefined) {
        $.each(tasks_per_project_order[project_id], function(i, task_id) {
            new_options += "<option value='" + task_id + "'>" + tasks_per_project[project_id][task_id] + "</option>";
        });
    }

    $('#task').html(new_options);
});

$('#task').on('change', function() {
    $('.action.stop').trigger('click');
    current_task_id = $(this).val();
    if (typeof (timers[current_task_id]) !== 'undefined') {
        if (parseInt(timers[current_task_id]['is_paused']) === 0) {
            $(".action.play").trigger('click');
        } else {
            update_timer();
        }
    } else {

    }
});

$('.action.stop').on('click', function() {
    if (current_task_id > 0) {
        if (typeof timers[current_task_id] !== 'undefined') {
            clearInterval(timers[current_task_id]['timer_interval']);
            show_play();
            delete timers[current_task_id];
            update_timer();
            $.get(baseURL + 'admin/projects/times/timers_stop/' + current_task_id + '/' + current_timestamp());
        }
    }
    return false;
});

$(document).on('click', '.action.pause', function() {
    if (current_task_id > 0) {
        show_play();
        clearInterval(timers[current_task_id]['timer_interval']);
        timers[current_task_id]['is_paused'] = 1;
        timers[current_task_id]['current_seconds'] = timers[current_task_id]['current_seconds'] + (current_timestamp() - timers[current_task_id]['last_modified_timestamp']);
        $.get(baseURL + 'admin/projects/times/timers_pause/' + current_task_id + '/' + current_timestamp());
    }
    return false;
});

$(document).on('click', '.action.play', function() {
    if (current_task_id > 0) {
        show_pause();

        if (typeof timers[current_task_id] === 'undefined') {
            timers[current_task_id] = {
                current_seconds: 0,
                is_paused: 0,
                last_modified_timestamp: current_timestamp(),
                project_id: $("#project").val(),
                project_name: $('#project :selected').text(),
                task_name: $('#task :selected').text()
            };

            $.get(baseURL + 'admin/projects/times/timers_play/' + current_task_id + '/' + current_timestamp());
        } else {
            timers[current_task_id]["current_seconds"] = parseInt(timers[current_task_id]["current_seconds"]);
        }

        if (parseInt(timers[current_task_id]['is_paused']) === 1) {
            $.get(baseURL + 'admin/projects/times/timers_play/' + current_task_id + '/' + current_timestamp());
            timers[current_task_id]['is_paused'] = 0;
            timers[current_task_id]["last_modified_timestamp"] = current_timestamp();
        }

        update_timer();
        timers[current_task_id]['timer_interval'] = setInterval(function() {
            update_timer();
        }, 1000);
    }
    return false;
});

function update_timer() {
    var elapsed_time = {};

    if (typeof (timers[current_task_id]) !== 'undefined') {
        elapsed_time = get_elapsed_time(timers[current_task_id]['current_seconds'], timers[current_task_id]['last_modified_timestamp'], timers[current_task_id]['is_paused']);
    } else {
        elapsed_time = {
            hours: "00",
            minutes: "00",
            seconds: "00"
        };
    }

    $(".timer-h").html(elapsed_time.hours);
    $(".timer-m").html(elapsed_time.minutes);
    $(".timer-s").html(elapsed_time.seconds);
    var title = "[" + elapsed_time.hours + ":" + elapsed_time.minutes + ":" + elapsed_time.seconds + "] " + $('#project :selected').text() + " - " + $('#task :selected').text();
    $("title").html(title);
}

function get_elapsed_time(current_seconds, last_modified_timestamp, is_paused) {
    if (parseInt(is_paused) === 0) {
        current_seconds = current_seconds + (current_timestamp() - last_modified_timestamp);
    }

    var hours = Math.floor(current_seconds / 3600);
    current_seconds = current_seconds - (hours * 3600);
    var minutes = Math.floor(current_seconds / 60);
    current_seconds = current_seconds - (minutes * 60);
    var seconds = current_seconds;

    hours = hours > 9 ? hours : '0' + hours.toFixed(0);
    minutes = minutes > 9 ? minutes : '0' + minutes.toFixed(0);
    seconds = seconds > 9 ? seconds : '0' + seconds.toFixed(0);

    return {
        hours: hours,
        minutes: minutes,
        seconds: seconds
    };
}

function current_timestamp() {
    return (+new Date() / 1000).toFixed(0);
}

function show_play() {
    $('.action.pause, .action.play').addClass('play').removeClass('pause').find('.fa-play, .fa-pause').addClass('fa-play').removeClass('fa-pause');
}

function show_pause() {
    $('.action.play, .action.pause').removeClass('play').addClass('pause').find('.fa-play, .fa-pause').addClass('fa-pause').removeClass('fa-play');
}

// Restart the timer on load, if one is currently set.
if (current_timer) {
    $('#client').val(current_timer.client_id).change();
    $('#project').val(current_timer.project_id).change();
    $('#task').val(current_timer.task_id).change();
}

// Keep the session alive.
setInterval(function() {
    $.get(baseURL);
}, 60 * 5 * 1000);