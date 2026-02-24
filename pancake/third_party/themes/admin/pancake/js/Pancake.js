/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package     Pancake
 * @author      Pancake Dev Team
 * @copyright   Copyright (c) 2015, Pancake Payments
 * @license     https://www.pancakeapp.com/license
 * @link        https://www.pancakeapp.com
 * @since       Version 4.8.29
 */

(function () {
    "use strict";

    var Time = {
        init: function () {
            $(document).on("input", ".js-livedisplay-time", function () {
                Time.update_time_display($(this).val(), $(this).siblings('.time'));
            });
        },
        parse_time: function (value) {
            return moment(value, ["H:m", "H:m:s", "H:m a"]);
        },
        parse_date: function (value) {
            var formats = [];
            $.each(momentjs_parsable_formats, function (key, value) {
                formats.push(key);
            });
            return moment(value, formats);
        },
        update_time_display: function (value, $output) {
            var time = Time.parse_time(value);

            if (time.isValid()) {
                $output.removeClass('invalid');
                $output.html(time.format(momentjs_time_format));
            } else {
                $output.addClass('invalid');
                $output.html(__("global:na"));
            }
        }
    };

    var Businesses = {
        init: function () {
            // Has to be document, tabs don't work well with #identities. - Bruno
            $(document)
                .on('click', '.js-add-business', Businesses.add_business)
                .on('click', '.js-remove-business', function (event) {
                    var $dd = $(this).parents("dd");
                    var $a = $dd.find('.js-tab-link');
                    event.preventDefault();
                    Businesses.remove_business($a.prop('href').split('#')[1]);
                });

            $('#identities').on('input', '[name*="[brand_name]"]', function () {
                var id = $(this).parents(".identity").prop('id').replace('Tab', '');
                var $a = $('.tabs').find('[href="#' + id + '"]');
                var val = $(this).val().trim();
                if (val === "") {
                    val = __("settings:new_business");
                }
                $a.text(val);
            });
        },

        add_business: function (event) {
            // Get the current timestamp as the ID
            var uniqid = Date.now();
            var new_id = 'identities_business_new_' + uniqid;
            var $new_el;
            var new_html = ("<li class='identity' id='" + new_id + "Tab'>" + $(".identity:first").html() + "</li>")
                .replace(/businesses\[([0-9]+)\]\[([a-zA-Z0-9_-]+)\]/gi, "businesses_new[$2][]")
                .replace(/business_([0-9]+)_/gi, "business_new_" + uniqid + "_");
            var new_tab = '<dd><a class="js-tab-link" href="#' + new_id + '">' + __("settings:new_business") + '</a><a href="#" type="button" class="js-remove-business"><i class="fa fa-times"></i></a></dd>';
            var $tabs = $("#identities").find(".tabs");

            if (event) {
                event.preventDefault();
            }

            $new_el = $(new_html);
            $new_el.find(".logo-business-identity, .remove-logo").remove();
            $new_el.find("input, textarea").val("");

            $tabs.find(".js-add-business").parents("dd").before(new_tab);

            $new_el.appendTo($(".js-identities-container"));
            $tabs.addClass('has-multiple-identities');
            $tabs.find('[href="#' + new_id + '"]').click();
        },
        remove_business: function (business_id) {
            var length = $(".identity").length;
            var $identities = $('#identities');
            var $tabs = $identities.find('.tabs');
            var $closest;
            var $dd = $tabs.find('[href="#' + business_id + '"]').parents('dd');

            if (length > 1) {
                if ($dd.next('dd:not(.js-add-business-dd)').length > 0) {
                    $closest = $dd.next('dd:not(.js-add-business-dd)');
                } else {
                    $closest = $dd.prev('dd:not(.js-add-business-dd)');
                }

                $dd.remove();
                $identities.find('.tabs-content').find('#' + business_id + 'Tab').remove();
                $closest.find('.js-tab-link').click();

                if (length === 2) {
                    $tabs.removeClass('has-multiple-identities');
                }
            } else {
                alert("You cannot remove your only business identity, Pancake would stop working!");
            }
        }
    };

    var Payments = {
        ppm_key: 1,
        invoice_unique_id: null,
        is_more_actions: null,

        init: function () {
            $('body')
                .on('click', 'a.partial-payment-details', Payments.open_payment_details)
                .on('click', '.add_payment', Payments.open_payment_details);

            $('#arbitrary-modal')
                .on('submit', '.js-payment-details-form', Payments.save_payment_details);
        },
        save_payment_details: function (event) {
            var $payment_button,
                payment_status,
                payment_gateway,
                data,
                is_paid,
                invoice_unique_id = Payments.invoice_unique_id,
                ppm_key = Payments.ppm_key,
                is_more_actions = Payments.is_more_actions,
                $payment_details_form = $('#arbitrary-modal').find('.js-payment-details-form'),
                submit_url = $payment_details_form.prop('action');

            payment_status = $('[name=payment-status]').val();
            payment_gateway = $('[name=payment-gateway]').val();
            $payment_button = $('.partial-payment-details.invoice_' + invoice_unique_id + '.key_' + ppm_key + ' span, .partial-inputs .partial-payment-details.key_' + ppm_key + ' span');
            is_paid = (payment_status !== '' && payment_gateway !== '');

            // Change to Payment Details if is_paid, otherwise change to Mark As Paid
            $payment_button.html(__(is_paid ? 'partial:paymentdetails' : 'partial:markaspaid'));

            data = {
                payment_status: payment_status,
                gateway: payment_gateway,
                date: $('[name=payment-date]').val(),
                transaction_id: $('[name=payment-tid]').val(),
                fee: $('[name=transaction-fee]').val(),
                send_payment_notification: ($('[name=send_payment_notification]').is(':checked') ? 'true' : 'false'),
                amount: $('[name=payment-amount]').val()
            };

            if (payment_status && !payment_gateway) {
                if ($payment_details_form.find('.inline-notification').length === 0) {
                    $payment_details_form.prepend('<div class="error inline-notification">' + __("invoices:select_a_gateway") + '</div>');
                }

                $payment_details_form.find('.inline-notification').slideDown();
            } else {
                $payment_details_form.find('.inline-notification').slideUp();

                $.post(submit_url, data).then(function () {
                    if (is_more_actions) {
                        // Refresh the page.
                        $('#main').load(window.location.href + ' #main');
                    }
                });

                close_reveal();
            }

            event.preventDefault();
        },
        open_payment_details: function (event) {
            var $el = $(this),
                is_more_actions,
                $parent,
                invoice_unique_id = window.invoice_unique_id,
                ppm_key = $el.data('details'),
                is_add_payment = false;

            if ($el.is('.add_payment')) {
                is_add_payment = true;
                ppm_key = 1;
            }

            if (typeof(invoice_unique_id) === "undefined") {
                invoice_unique_id = $el.data('invoice-unique-id');
            }

            if (typeof(invoice_unique_id) === "undefined") {
                $parent = $el.parents('[data-unique-id]');
                invoice_unique_id = $parent.data("unique-id");
                ppm_key = 1;
            }

            if ($el.parents('.gear-menu').length > 0) {
                is_more_actions = true;
            }

            Payments.invoice_unique_id = invoice_unique_id;
            Payments.ppm_key = ppm_key;
            Payments.is_more_actions = is_more_actions;
            is_add_payment = is_add_payment ? '/true' : '';
            open_reveal(baseURL + 'ajax/get_payment_details/' + invoice_unique_id + '/' + ppm_key + is_add_payment, {closeOnBackgroundClick: false});
            event.preventDefault();
        }
    };

    var Notifications = {
        is_showing_close_all: false,
        ids_on_screen: [],
        is_destroying: false,
        destroying_ids: [],
        init: function () {
            if (notification_poll_seconds > 0) {
                setInterval(function () {
                    Notifications.get_unseen();
                }, notification_poll_seconds * 1000);
            }
            Notifications.get_unseen();

            $("body")
                .on("click", ".meow:not(.notification-close-all-container)", Notifications.click_notification_link)
                .on("click", ".notification-close-all-container", Notifications.mark_all_as_read);
        },
        click_notification_link: function (event) {
            if (typeof(event) !== "undefined") {
                if ($(event.target).is('.close')) {
                    return;
                }

                $(this).find("a:not(.close)")[0].click();
            }
        },
        mark_all_as_read: function (event, destroy_all) {
            if (typeof(destroy_all) !== "boolean") {
                destroy_all = true;
            }

            if (destroy_all) {
                if (typeof(event) !== "undefined") {
                    if ($(event.target).is('.close')) {
                        return;
                    }
                }

                Notifications.is_destroying = true;
                Notifications.destroying_ids = Notifications.ids_on_screen.slice();
                $.post(site_url("admin/notifications/mark_all_as_seen")).then(function () {
                    Notifications.is_destroying = false;
                });
                $(".meows").find(".close").click();
            }
        },
        handle_mark_all_as_read: function () {
            if (Notifications.ids_on_screen.length > 1) {
                if (!Notifications.is_showing_close_all) {
                    $.meow({
                        message: '<div class="notification-close-all">' + __("notifications:mark_all_as_read") + '</div>',
                        prepend: true,
                        sticky: true,
                        afterDestroy: function () {
                            Notifications.is_showing_close_all = false;
                        }
                    });

                    $(".notification-close-all").parents(".meow").addClass("notification-close-all-container");
                    Notifications.is_showing_close_all = true;
                }
            } else {
                $(".notification-close-all-container .close").trigger('click', [false]);
            }
        },
        get_unseen: function () {
            var url = site_url("admin/notifications/get_unseen");
            var data = {'ids_on_screen': Notifications.ids_on_screen};
            $.getJSON(url, data).then(Notifications.process_unseen_notifications);
        },
        process_unseen_notifications: function (response) {
            $.each(response.new_notifications, function (i, item) {
                if ($.inArray(item.id, Notifications.ids_on_screen) === -1) {
                    Notifications.ids_on_screen.push(item.id);

                    $.meow({
                        title: 'Notification',
                        message: item.message,
                        sticky: true,
                        beforeDestroy: function () {
                            var index = Notifications.ids_on_screen.indexOf(item.id);

                            if (index !== -1) {
                                Notifications.ids_on_screen.splice(index, 1);
                            }

                            if ($.inArray(item.id, Notifications.destroying_ids) === -1) {
                                $.post(site_url('admin/notifications/mark_as_seen'), {'id': item.id});
                            }

                            Notifications.handle_mark_all_as_read();
                        }
                    });
                }
            });

            $.each(response.seen_notifications, function (i, item_id) {
                if ($.inArray(item_id, Notifications.ids_on_screen) !== -1) {
                    $('[data-notification-id="' + item_id + '"]').parents(".meow").find(".close").click();
                }
            });

            Notifications.handle_mark_all_as_read();
        }
    };

    var Cache = {
        settings: {
            index: {
                $filesystem_settings_containers: null
            },
            import: {
                $items: null,
                line_items_showing: 0,
                line_items_count: 0,
                $payments: null,
                payments_showing: 0,
                payments_count: 0
            }
        },
        invoices: {
            reminders: {
                reminder_checkboxes: null
            }
        }

    };

    var Helpers = {
        show_error: function (title, message) {
            if (!title) {
                title = __("error:title");
            }

            if (!message) {
                message = __("error:subtitle");
            }

            open_reveal("<div class='modal-error'><h3>" + title + "</h3><p>" + message + "</p></div>");
        }
    };

    var Pancake = {
        common: {
            init: function () {
                Notifications.init();
                Time.init();
                Payments.init();

                $("body")
                    .on("click", ".close-reveal-modal, .js-close-modal", function (event) {
                        event.preventDefault();
                        $(".reveal-modal:visible").trigger("reveal:close");
                    })
                    .on("click", "a.open-modal", function (event) {
                        event.preventDefault();
                        open_reveal($(this).prop('href'));
                    });
            },
            finalize: function () {

            }
        },
        discussions: {
            init: function () {
                $(".js-confirm-delete-comment").on("click", function (event) {
                    if (!confirm(__("discussions:are_you_sure_delete"))) {
                        event.preventDefault();
                    }
                });
            }
        },
        invoices: {
            reminders: function (cache) {
                var $reminders = $("#reminders");

                cache.reminder_checkboxes = $reminders.find('[type="checkbox"]');

                $reminders.find("th:first").on("click", function check_all_reminders() {
                    var count_checked = cache.reminder_checkboxes.filter(":checked").length;

                    if (cache.reminder_checkboxes.length == count_checked) {
                        cache.reminder_checkboxes.prop('checked', false);
                    } else {
                        cache.reminder_checkboxes.prop('checked', true);
                    }
                }).on("click", "td:first-child", function check_reminder(event) {
                    if (!$(event.target).is('input')) {
                        $(event.target).find('input').prop('checked', function (i, val) {
                            return !val;
                        });
                    }
                });
            }
        },
        projects: {
            init: function () {
                $("body").on("change", '.js-projects-form [name="client_id"]', function () {
                    var val = $(this).val();
                    var $form = $(".js-projects-form");
                    var $currency = $form.find('[name="currency"]');
                    $currency.val(default_currencies_per_client[val] ? default_currencies_per_client[val] : "0");
                });
            }
        },
        settings: {
            index: function (cache) {
                $(document).foundationTabs();
                Businesses.init();

                cache.$filesystem_settings_containers = $('.js-filesystem');

                $('.upgrade-btn').on('click', function upgrade_pancake(event) {

                    var url = $(this).attr('href');

                    event.preventDefault();
                    $(this).addClass('disabled').html($(this).data('loading-text'));
                    $.get(url).done(function (data) {
                        if (data == "UPDATED" || url.indexOf("check_latest_version") !== -1) {
                            window.location.reload(true);
                        } else {
                            // This will replace the page with the right error page if there is an error with the update.
                            var newDoc = document.open("text/html", "replace");
                            newDoc.write(data);
                            newDoc.close();
                        }
                    }).fail(function (jqXHR, textStatus) {
                        Helpers.show_error(null, textStatus);
                    });
                });

                $('[name="filesystem[adapters][]"]').on("change", function update_shown_filesystem_settings() {
                    var val = $(this).val();
                    var $new_settings;
                    var $settings_to_hide = cache.$filesystem_settings_containers;
                    var new_settings_selector = [];

                    if (val) {
                        $.each(val, function (key, value) {
                            new_settings_selector.push(".js-filesystem-" + value);
                        });

                        $new_settings = $(new_settings_selector.join(", "));

                        if ($new_settings.length > 0) {
                            $settings_to_hide = cache.$filesystem_settings_containers.not($new_settings);
                        }
                    }

                    if ($settings_to_hide.length > 0) {
                        $settings_to_hide.slideUp('fast', function show_new_filesystem_settings() {
                            if ($new_settings) {
                                $new_settings.slideDown('fast');
                            }
                        });
                    } else {
                        if ($new_settings) {
                            $new_settings.slideDown('fast');
                        }
                    }
                }).change();

                $('.sidebar-tabs').on('tabsactivate', function (event, ui) {
                    window.location.hash = '#' + ui.newPanel.prop('id');
                }).tabs();

                $('.tabs').on('click', function (event) {
                    event.preventDefault();
                });

                $(window).on('hashchange', function () {
                    var index, $el;

                    if (window.location.hash !== '#' && window.location.hash !== "") {
                        $el = $('.sidebar-tabs a[href="' + window.location.hash + '"]');
                        index = $el.prop('id').replace('ui-id-') - 1;
                        $('.sidebar-tabs').tabs("option", "active", index);

                        $('#frontend_css, #backend_css, #frontend_js, #backend_js').each(function () {
                            var codemirror = $(this).data('codemirror');

                            if (codemirror) {
                                codemirror.refresh();
                            }
                        });
                    }
                });
            },
            import: function (cache) {
                cache.$items = $(".js-item");
                if (cache.$items.length > 0) {
                    cache.line_items_showing = parseInt(cache.$items.not(".hidden").last().attr("class").split("js-item").join("").split("-")[1]);
                    cache.line_items_count = parseInt(cache.$items.last().attr("class").split("js-item").join("").split("-")[1]);
                    cache.$payments = $(".js-payment");
                    cache.payments_showing = parseInt(cache.$payments.not(".hidden").last().attr("class").split("js-payment").join("").split("-")[1]);
                    cache.payments_count = parseInt(cache.$payments.last().attr("class").split("js-payment").join("").split("-")[1]);

                    $(".js-show-another-item").on("click", function show_another_item(event) {
                        event.preventDefault();

                        if (cache.line_items_showing >= cache.line_items_count) {
                            // Don't do anything; there are no more items to include.
                            return;
                        }

                        if (cache.line_items_showing >= (cache.line_items_count - 1)) {
                            // Hide the button, as after this click it won't work again.
                            $(this).hide();
                        }

                        var new_item = '.js-item-' + (cache.line_items_showing + 1);
                        cache.$items.filter(new_item).removeClass("hidden");
                        cache.line_items_showing += 1;
                    });

                    $(".js-show-another-payment").on("click", function show_another_payment(event) {
                        event.preventDefault();

                        if (cache.payments_showing >= cache.payments_count) {
                            // Don't do anything; there are no more payments to include.
                            return;
                        }

                        if (cache.payments_showing >= (cache.payments_count - 1)) {
                            // Hide the button, as after this click it won't work again.
                            $(this).hide();
                        }

                        var new_payment = '.js-payment-' + (cache.payments_showing + 1);
                        cache.$payments.filter(new_payment).removeClass("hidden");
                        cache.payments_showing += 1;
                    });
                }
            }
        }
    };

    window.Cache = Cache;
    window.Pancake = Pancake;
    window.Time = Time;
}());


UTIL = {
    fire: function (func, funcname) {
        var namespace = Pancake, args = null;
        funcname = (funcname === undefined) ? 'init' : funcname;

        if (Cache[func] !== undefined) {
            if (Cache[func][funcname] !== undefined) {
                args = Cache[func][funcname];
            } else {
                args = Cache[func];
            }
        }

        if (func !== '' && namespace[func] && typeof namespace[func][funcname] == 'function') {
            namespace[func][funcname](args);
        }
    },
    loadEvents: function () {
        var bodyId = document.body.id;
        UTIL.fire('common');
        $.each(document.body.className.split(/\s+/), function (i, classnm) {
            // Ignore classes that are not for JS to understand.
            if (classnm.indexOf("controller-") !== -1 || classnm.indexOf("module-") !== -1 || classnm.indexOf("action-") !== -1 || classnm == "body-wrap" || classnm == "not-login-layout" || classnm == "main-layout" || classnm == "admin" || classnm == "not-admin") {
                return;
            }

            UTIL.fire(classnm);
            UTIL.fire(classnm, bodyId);
        });
        UTIL.fire('common', 'finalize');
    }
};

UTIL.loadEvents();