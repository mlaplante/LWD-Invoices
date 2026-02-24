<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
        <meta name="viewport" content="width=device-width"/>
        <meta name="robots" content="noindex, nofollow"/>
        <title><?php echo $title; ?></title>
        <style>
            html, body, div, span, applet, object, iframe,
            h1, h2, h3, h4, h5, h6, p, blockquote, pre,
            a, abbr, acronym, address, big, cite, code,
            del, dfn, em, img, ins, kbd, q, s, samp,
            small, strike, strong, sub, sup, tt, var,
            b, u, i, center,
            dl, dt, dd, ol, ul, li,
            fieldset, form, label, legend,
            table, caption, tbody, tfoot, thead, tr, th, td,
            article, aside, canvas, details, embed,
            figure, figcaption, footer, header, hgroup,
            menu, nav, output, ruby, section, summary,
            time, mark, audio, video {
                margin: 0;
                padding: 0;
                border: 0;
                font: inherit;
                font-size: 100%;
                vertical-align: baseline;
            }

            html {
                line-height: 1;
            }

            ol, ul {
                list-style: none;
            }

            table {
                border-collapse: collapse;
                border-spacing: 0;
            }

            caption, th, td {
                text-align: left;
                font-weight: normal;
                vertical-align: middle;
            }

            q, blockquote {
                quotes: none;
            }

            q:before, q:after, blockquote:before, blockquote:after {
                content: "";
                content: none;
            }

            article, aside, details, figcaption, figure, footer, header, hgroup, menu, nav, section, summary {
                display: block;
            }

            body {
                color: #666;
                width: 100%;
                font: 12px Arial, Helvetica, sans-serif;
                background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyRpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NTY2MSwgMjAxMi8wMi8wNi0xNDo1NjoyNyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNiAoTWFjaW50b3NoKSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpBN0QxRTRGQjJEMTcxMUUyQTBCQkVBNDM3RTVDQzgyOSIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDpBN0QxRTRGQzJEMTcxMUUyQTBCQkVBNDM3RTVDQzgyOSI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOkE3RDFFNEY5MkQxNzExRTJBMEJCRUE0MzdFNUNDODI5IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOkE3RDFFNEZBMkQxNzExRTJBMEJCRUE0MzdFNUNDODI5Ii8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+lxCQkQAAEJFJREFUWMMFwQmy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") repeat;
            }

            a {
                color: #000;
                text-decoration: underline;
            }

            a:hover {
                text-decoration: underline;
            }

            a:focus {
                outline: none;
            }

            #wrapper {
                width: 100%;
                max-width: <?php echo isset($max_width) ? $max_width : 360; ?>px;
                margin: 20px auto 80px auto;
                background: #fff;
                padding: 30px 30px 10px;
                -webkit-border-radius: 4px;
                -moz-border-radius: 4px;
                -ms-border-radius: 4px;
                -o-border-radius: 4px;
                border-radius: 4px;
                -webkit-box-shadow: 0px 0px 7px #cccccc;
                -moz-box-shadow: 0px 0px 7px #cccccc;
                box-shadow: 0px 0px 7px #cccccc;
            }

            #header-area {
                width: 100%;
                max-width: 420px;
                margin: 80px auto 20px;
                text-align: center;
            }

            #header-area .logo {
                overflow: hidden;
                width: 100%;
                font-size: 36px;
                line-height: 38px;
                text-align: center;
                margin-bottom: 30px;
                color: #142c35;
                padding-bottom: 1px;
                font-family: "Helvetica Neue", Helvetica, Arial, Sans-serif;
                text-shadow: 0 2px #fff;
            }

            @media all and (max-width: 768px) {
                #header-area {
                    margin-top: 30px;
                }
            }

            img {
                border: 0 !important;
            }

            small {
                font-size: 0.85em;
            }

            h1, h2, h3, h4, h4 {
                color: #5D5751;
            }

            h2 {
                text-align: center;
                font-size: 22px;
                margin: 0 0 1em 0;
            }

            p {
                text-align: center;
                font-size: 16px;
                line-height: 1.4em;
                margin-bottom: 1em;
            }

            p.known-error {
                text-align: left;
            }

            .btn {
                color: white !important;
                text-shadow: none;
                border: 0;
                font-size: 14px !important;
                font-weight: 700 !important;
                text-decoration: none;
                border-radius: 4px;
                text-shadow: 1px 1px 1px #4da0cc;
                cursor: pointer;
                line-height: 1.4em;
                padding: 10px 16px;
                background: #29abe2;
                display: inline-block;
                width: <?php echo isset($max_width) ? ($max_width - 32 ) : 328; ?>px;

                -webkit-transition: width 500ms cubic-bezier(0.565, 0, 0.415, 1); /* older webkit */
                -webkit-transition: width 500ms cubic-bezier(0.565, -0.325, 0.415, 1.565);
                -moz-transition: width 500ms cubic-bezier(0.565, -0.325, 0.415, 1.565);
                -o-transition: width 500ms cubic-bezier(0.565, -0.325, 0.415, 1.565);
                transition: width 500ms cubic-bezier(0.565, -0.325, 0.415, 1.565); /* custom */
            }

            .btn.success, .btn.success:hover {
                width: 50px;
                background-color: #5cb85c;
                text-shadow: 1px 1px 1px #3d8b3d;
                cursor: default;
            }

            .btn.success.wide-success {
                width: 228px;
            }

            .btn.waiting, .btn.waiting:hover {
                width: 150px;
                background-color: #ccc;
                text-shadow: 1px 1px 1px #aaa;
                cursor: default;
            }

            .btn:hover {
                background: #0071bc;
                color: #fff;
                text-decoration: none;
            }

            code {
                font-family: monospace;
                margin: 0 2px;
                padding: 0 5px;
                word-wrap: break-word;
                border: 1px solid #eaeaea;
                background-color: #f8f8f8;
                border-radius: 3px;
            }

        </style>
    </head>
    <body>
        <div id="header-area">
            <h1 class='logo'><?php echo defined('ENV_TITLE') ? ENV_TITLE : $title; ?></h1>
        </div>
        <div id="wrapper">
            <div id="main" class="form-holder">
                <?php if (isset($subtitle) && !empty($subtitle)): ?>
                    <h2 style="max-width: 360px; margin-left: auto; margin-right: auto;"><?php echo $subtitle; ?></h2>
                <?php endif; ?>
                <?php echo $enduser_message; ?>
            </div>
        </div>
        <?php if (class_exists("Pancake_Exceptions")): ?>
            <script src="//code.jquery.com/jquery-1.11.0.min.js"></script>
            <script>
                $(".btn").on("click", function (event) {
                    event.preventDefault();
                    var $btn = $(this);
                    if (!$btn.is(".success") && !$btn.is(".waiting")) {
                        $btn.addClass("waiting").html("<?php echo Pancake_Exceptions::translate("error:sending_details"); ?>");
                        $.getJSON($btn.attr("href")).done(function (data) {
                            if (data.success) {
                                if (typeof(data.email) !== "undefined") {
                                    $("<p style='margin-top: 1em;'><?php echo Pancake_Exceptions::translate("error:response_will_be_sent_to_email"); ?></p>".split("{email}").join(data.email)).insertAfter($btn);
                                } else if (typeof(data.version) !== "undefined") {
                                    $("<p style='margin-top: 1em;'><?php echo Pancake_Exceptions::translate("error:fixed_in_version"); ?></p>".split("{version}").join(data.version)).insertAfter($btn);
                                } else {
                                    $("<p style='margin-top: 1em;'><?php echo Pancake_Exceptions::translate("error:already_being_dealt_with"); ?></p>").insertAfter($btn);
                                }
                                $btn.removeClass("waiting").addClass("success").html("&#x2713;");
                            } else {
                                alert(data.error);
                            }
                        }).fail(function () {
                            alert("<?php echo Pancake_Exceptions::translate("error:unknown_error_reporting"); ?>");
                        });
                    }
                });
            </script>
        <?php endif; ?>
    </body>
</html>