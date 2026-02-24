<?php

/**
 * Pancake
 * A simple, fast, self-hosted invoicing application.
 *
 * @category  APIs
 * @package   Pancake
 * @author    Pancake Dev Team <support@pancakeapp.com>
 * @copyright 2016 Pancake Payments
 * @license   https://www.pancakeapp.com/license Pancake End User License Agreement
 * @link      https://www.pancakeapp.com
 * @since     4.12.18
 */

namespace Pancake\Email;

/**
 * The Email API<br />Allows you to send mails with Pancake.
 *
 * @category Email
 */
class Email {

    /**
     * The custom stream options for SwiftMailer.
     * See http://php.net/manual/en/context.ssl.php for details on allowed options and values.
     *
     * @var array
     */
    protected static $stream_options;

    /**
     * The SwiftMailer logger for all SMTP output.
     *
     * @var \Swift_Plugins_Logger
     */
    protected static $logger;

    /**
     * The SwiftMailer mailer for sending all email.
     *
     * @var \Swift_Mailer
     */
    protected static $mailer;

    /**
     * Sends a Pancake email. Uses the right Pancake theme,
     * fetches template details from the DB, inserts a record of the email
     * in the client's contact log, processes variables, and everything else you need.
     * Available options:
     * REQUIRED to - the email recipient
     * REQUIRED template - the 'identifier' of the desired template in email_settings_templates
     * REQUIRED data - an array of variables to be processed into the template (can contain sub-arrays)
     * REQUIRED client_id - the client's id, for storing email in the contact log
     * OPTIONAL attachments - an array of files in filename => filedata pairs
     * OPTIONAL subject - if provided, will be used instead of the template's default
     * OPTIONAL message - if provided, will be used instead of the template's default
     * OPTIONAL from - if provided, will be used instead of the system's default
     * The following is added to the "data" array automatically:
     * settings -> An array with all settings
     * logo -> The logo's URL
     * user_display_name -> The display name of the current logged in user (or the {settings:admin_name} if not available)
     * client -> The client's record, WITH {client:access_url}
     *
     * @param array $options
     *
     * @return boolean
     */
    public static function send($options = array()) {

        if (!isset($options['to']) or !isset($options['template']) or !isset($options['data']) or !isset($options['client_id'])) {
            throw new \InvalidArgumentException(__METHOD__ . "() needs to, template, client_id and data arguments.");
        }

        if (!isset($options['attachments'])) {
            $options['attachments'] = array();
        }

        if (!isset($options['subject'])) {
            $options['subject'] = null;
        }

        if (!isset($options['message'])) {
            $options['message'] = null;
        }

        if (!isset($options['from'])) {
            $options['from'] = null;
        }

        if (!isset($options['unique_id'])) {
            $options['unique_id'] = null;
        }

        if (!isset($options['item_type'])) {
            $options['item_type'] = null;
        }

        $CI = get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('clients/clients_m');
        $CI->load->model('invoices/partial_payments_m', 'ppm');
        $CI->load->model('files/files_m');
        $CI->load->model('tickets/ticket_m');
        $CI->load->model('email_settings_templates');

        $template_details = $CI->email_settings_templates->get($options['template']);

        if (empty($options['subject'])) {
            $options['subject'] = $template_details['subject'];
        }

        if (empty($options['message'])) {
            $options['message'] = $template_details['message'];
        }

        $options = $CI->dispatch_return('before_send_pancake_email', $options, 'array');
        if (count($options) == 1) {
            # $options was modified by a plugin.
            $options = reset($options);
        }

        $to = $options['to'];
        $template = $options['template'];
        $data = $options['data'];
        $client_id = $options['client_id'];
        $attachments = $options['attachments'];
        $custom_subject = $options['subject'];
        $custom_message = $options['message'];
        $custom_from = $options['from'];
        $unique_id = $options['unique_id'];
        $item_type = $options['item_type'];

        \Business::setBusinessFromClient($client_id);

        if ($custom_from === null) {
            if (logged_in() and \Settings::get('send_emails_from_logged_in_user')) {
                $from = $CI->current_user->email;
                $from_name = "{$CI->current_user->first_name} {$CI->current_user->last_name}";
            } else {
                switch ($template) {
                    case 'new_invoice':
                    case 'new_credit_note':
                    case 'new_estimate':
                    case 'new_proposal':
                    case 'invoice_payment_notification_for_admin':
                    case 'invoice_payment_notification_for_client':
                    case 'new_ticket_invoice':
                        # reset+explode because we want to get the first address in what may be a comma-separated list.
                        $from = array_reset(explode(',', \Business::getBillingEmail()));
                        $from_name = \Business::getBillingEmailFrom();
                        break;
                    default:
                        # reset+explode because we want to get the first address in what may be a comma-separated list.
                        $from = array_reset(explode(',', \Business::getNotifyEmail()));
                        $from_name = \Business::getNotifyEmailFrom();
                }
            }

            $custom_from = "$from $from_name";
        }

        $client = (array) $CI->clients_m->get($client_id);
        $client['display_name'] = client_name($client);
        $client['access_url'] = site_url(\Settings::get('kitchen_route') . '/' . $client['unique_id']);

        $data['client'] = $client;
        $settings = (array) \Settings::get_all();

        $data['logo'] = \Business::getLogoUrl();
        $data['business'] = \Business::getBusiness();
        $data['settings'] = $settings;
        $data['user_display_name'] = logged_in() ? ($CI->current_user->first_name . ' ' . $CI->current_user->last_name) : \Business::getAdminName();

        if (isset($data['invoice'])) {
            $data['invoice']['items'] = array_values($data['invoice']['items']);

            foreach ($data['invoice']['partial_payments'] as $key => $part) {
                $data['invoice']['partial_payments'][$key]['billableAmount'] = \Currency::format($part['billableAmount'], $data['invoice']['currency_code']);
            }

            $data['invoice']['partial_payments'] = array_values($data['invoice']['partial_payments']);

            if (array_key_exists("billable_amount", $data['invoice']) and array_key_exists("currency_code", $data['invoice'])) {
                $data['invoice']['billable_amount'] = \Currency::format($data['invoice']['billable_amount'], $data['invoice']['currency_code']);
            }

            if (array_key_exists("unpaid_amount", $data['invoice']) and array_key_exists("currency_code", $data['invoice'])) {
                $data['invoice']['unpaid_amount'] = \Currency::format($data['invoice']['unpaid_amount'], $data['invoice']['currency_code']);
            }

            if (array_key_exists("paid_amount", $data['invoice']) and array_key_exists("currency_code", $data['invoice'])) {
                $data['invoice']['paid_amount'] = \Currency::format($data['invoice']['paid_amount'], $data['invoice']['currency_code']);
            }

            if (array_key_exists("amount", $data['invoice']) and array_key_exists("currency_code", $data['invoice'])) {
                $data['invoice']['amount'] = \Currency::format($data['invoice']['amount'], $data['invoice']['currency_code']);
            }

            if (isset($data['invoice']['due_date'])) {
                $data['invoice']['original_due_date'] = $data['invoice']['due_date'];
                $data['invoice']['due_date'] = format_date($data['invoice']['due_date']);
            }

            # For compatibility.
            $data['estimate'] = $data['invoice'];
            $data['credit_note'] = $data['invoice'];

            $overdue_invoices = $CI->invoice_m->get_all_overdue($client_id);
            unset($overdue_invoices[$data["invoice"]["id"]]);

            $outstanding_invoices = $CI->invoice_m->get_all_sent_but_unpaid($client_id);
            unset($outstanding_invoices[$data["invoice"]["id"]]);

            $data["overdue_invoices"] = $overdue_invoices;
            $data["outstanding_invoices"] = $outstanding_invoices;
        }

        $data['settings']['site_name'] = \Business::getBrandName();
        $data['settings']['mailing_address'] = \Business::getMailingAddress();
        $data['settings']['admin_name'] = \Business::getAdminName();
        $data['settings']['notify_email'] = \Business::getNotifyEmail();
        $data['settings']['logo_url'] = \Business::getLogoUrl();

        $data = $CI->dispatch_return('process_pancake_email_data_array', $data, 'array');
        if (count($data) == 1) {
            # $data was modified by a plugin.
            $data = reset($data);
        }

        ################################################
        #
        # This is here for easy dumping of all current variables.
        # Note, you need to get this for sending an invoice, for a payment notification, for comments, and for tickets.
        # To make sure that you have all variables at hand.
        # Then, regex from:
        #     ({{.+?}})
        # To:
        #     * `\1`
        # And add to Markdown file.
        #
        ################################################
        if (IS_DEBUGGING && false) {
            header("Content-Type: text/plain");
            unset($data['estimate']);
            unset($data['credit_note']);

            $output = array();
            foreach ($data as $key => $value) {
                if (!is_array($value)) {
                    $output[] = "{{" . $key . "}}";
                } else {
                    foreach ($value as $subkey => $subvalue) {
                        if (!is_array($subvalue)) {
                            $output[] = "{{" . $key . "." . $subkey . "}}";
                        } else {
                            foreach ($subvalue as $subsubkey => $subsubvalue) {
                                if (!is_array($subsubvalue)) {
                                    $output[] = "{{" . $key . "." . $subkey . "." . $subsubkey . "}}";
                                } else {
                                    foreach ($subsubvalue as $subsubsubkey => $subsubsubvalue) {
                                        if (!is_array($subsubsubvalue)) {
                                            $output[] = "{{" . $key . "." . $subkey . "." . $subsubkey . "." . $subsubsubkey . "}}";
                                        } else {
                                            # Ignore these.
                                            # echo "(Array) {{".$key.".".$subkey.".".$subsubkey.".".$subsubsubkey."}}"."\n";
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            natsort($output);
            echo implode("\n", $output);

            die;
        }

        $custom_subject = get_instance()->mustache->render($custom_subject, $data);
        $custom_subject = html_entity_decode($custom_subject);

        $custom_message = get_instance()->mustache->render($custom_message, $data);

        # This fixes an issue with the BCC engine.
        $data['bcc'] = '{{bcc}}';
        $data['tracking_image'] = '{{tracking_image}}';

        $template = \Email_Template::build($template_details['template'], nl2br($custom_message), $custom_subject);
        $template = get_instance()->mustache->render($template, $data);

        try {
            $return = static::sendRaw($to, $custom_subject, $template, $custom_from, $attachments, $unique_id, $item_type);
        } catch (EmailException $e) {
            return false;
        }

        $CI->db->reconnect();

        if ($return) {
            $CI->load->model('clients/contact_m');

            if (is_string($to) and strpos($to, ',') !== false) {
                $to = explode(',', $to);
            }

            if (is_string($to)) {
                $to = array($to);
            }

            if (is_array($to)) {
                foreach ($to as $recipient) {
                    $recipient = trim($recipient);
                    if (!in_array($recipient, $return["failed_recipients"])) {
                        $CI->contact_m->insert(array(
                            'client_id' => $client_id,
                            'method' => 'email',
                            'contact' => $recipient,
                            'subject' => $custom_subject,
                            'content' => $custom_message,
                            'duration' => 0,
                            'sent_date' => now()->timestamp,
                            'user_id' => logged_in() ? (int) $CI->current_user->id : 0,
                        ), true); # True to skip validation, because validation screws up $_POST. (who did this?!?!) - Bruno
                    }
                }
                return true;
            }

            return true;
        } else {
            return false;
        }
    }

    /**
     * Check if an SMTP server's name matches the expected server name.
     *
     * @param string $expected_host
     * @param string $actual_smtp_output
     *
     * @throws EmailException If it cannot detect the SMTP host from the SMTP logs.
     * @throws EmailHijackException If the $expected_host is not found in the SMTP logs.
     */
    protected static function assertNotMitm($expected_host, $actual_smtp_output) {
        $matches = [];
        if (preg_match('/220[- ]([^\\s]+)[- ]ESMTP/uis', $actual_smtp_output, $matches)) {
            $actual_host = $matches[1];

            # Workaround for AOL SMTP servers.
            if ($expected_host == "smtp.aol.com") {
                $search = ".mx.aol.com";
                if (substr($actual_host, -strlen($search)) == $search) {
                    # It's OK, it's one of their SMTP servers.
                    return;
                }
            }

            # Workaround for AWS SES servers.
            if ($expected_host === "email-smtp.us-east-1.amazonaws.com") {
                $search = ".amazonaws.com/";
                if (substr($actual_host, -strlen($search)) == $search) {
                    # It's OK, it's one of their SMTP servers.
                    return;
                }
            }

            # Workaround for DreamHost servers.
            $search = ".dreamhost.com";
            if (substr($actual_host, -strlen($search)) == $search) {
                # It's OK, it's one of their SMTP servers.
                return;
            }

            if ($actual_host != $expected_host) {
                $exception = new \Pancake\Email\EmailHijackException("You were trying to make a connection to $expected_host, but your webserver hijacked it and redirected it to $actual_host.");
                $exception->setActualHost($actual_host);
                $exception->setExpectedHost($expected_host);
                throw $exception;
            }
        } else {
            # We couldn't get the host, but in the spirit of keeping things working, we're going to assume no MITM.
            return;
        }
    }

    /**
     * Get a ready-to-use \Swift_SmtpTransport for Gmail.
     *
     * @param int   $port
     * @param array $authentication_options
     * @param bool  $is_testing
     *
     * @return bool|\Swift_SmtpTransport
     * @throws EmailException
     */
    protected static function getGmailTransport($port, $authentication_options, $is_testing = false) {
        try {
            $stream_options = static::getStreamOptions();

            # We're testing gmail on a known good port, and want to let the exception be thrown if it fails.
            $transport = new \Swift_SmtpTransport("smtp.gmail.com", $port, $port == 465 ? "ssl" : "tls");
            $transport->registerPlugin(new \Swift_Plugins_LoggerPlugin(static::getLogger()));

            if (isset($authentication_options["gmail_email"])) {
                $transport->setAuthMode('XOAUTH2');
                $transport->setUsername($authentication_options["gmail_email"]);
                $transport->setPassword($authentication_options["gmail_access_token"]);
            } elseif (isset($authentication_options["smtp_user"])) {
                $transport->setUsername($authentication_options['smtp_user']);
                $transport->setPassword($authentication_options['smtp_pass']);
            } else {
                throw new EmailException("Was trying to connect to Gmail for sending email, but did not get any credentials.");
            }

            if (!empty($stream_options)) {
                $transport->setStreamOptions($stream_options);
            }

            $transport->start();
            return $transport;
        } catch (\Swift_TransportException $e) {
            return static::handleFailure($e, "smtp.gmail.com", $is_testing);
        }
    }

    /**
     * Gets the custom stream options for SwiftMailer, if any are set.
     *
     * @return array
     */
    protected static function getStreamOptions() {
        if (static::$stream_options === null) {
            $stream_options = get_instance()->dispatch_return('set_stream_options', [], 'array');

            if (!empty($stream_options)) {
                # Process the plugin-changed array.
                $stream_options = array_reset($stream_options);
            }

            static::$stream_options = $stream_options;
        }

        return static::$stream_options;
    }

    /**
     * Gets the email configurations to use for emailing.
     *
     * @param array $email_config
     *
     * @return array
     */
    protected static function getEmailConfigs($email_config = null) {
        $is_testing = $email_config !== null;

        if (!$is_testing) {
            $email_config = get_instance()->settings_m->interpret_email_settings();
        }

        return [
            "is_testing" => $is_testing,
            "email_config" => $email_config,
        ];
    }

    /**
     * Gets an instance of the SwiftMailer Logger.
     *
     * @return \Swift_Plugins_Logger
     */
    protected static function getLogger() {
        if (static::$logger === null) {
            static::$logger = new \Swift_Plugins_Loggers_ArrayLogger(1024);
        }

        return static::$logger;
    }

    /**
     * Gets a ready-to-use \Swift_SmtpTransport based on the email configurations being used.
     *
     * @param array $email_config
     *
     * @return false|\Swift_SmtpTransport|\Swift_SendmailTransport
     */
    protected static function getTransport($email_config) {
        $is_testing = $email_config["is_testing"];
        $email_config = $email_config["email_config"];

        switch ($email_config['type']) {
            case 'gmail':
            case 'smtp':
                if ($email_config['type'] == "gmail") {
                    if (\Settings::get("gmail_email")) {
                        $authentication_options = [
                            "gmail_email" => \Settings::get("gmail_email"),
                            "gmail_access_token" => get_instance()->settings_m->get_google_access_token(),
                        ];
                    } else {
                        $authentication_options = [
                            "smtp_user" => $email_config["smtp_user"],
                            "smtp_pass" => $email_config["smtp_pass"],
                        ];
                    }

                    if (isset($email_config['force_port'])) {
                        $transport = static::getGmailTransport($email_config['force_port'], $authentication_options, $is_testing);
                    } else {
                        # We're trying to send email, and will try all ports.
                        try {
                            $transport = static::getGmailTransport(465, $authentication_options, $is_testing);
                        } catch (\Swift_TransportException $e) {
                            try {
                                $transport = static::getGmailTransport(587, $authentication_options, $is_testing);
                            } catch (\Swift_TransportException $e) {
                                $transport = static::getGmailTransport(25, $authentication_options, $is_testing);
                            }
                        }
                    }
                } else {
                    try {
                        $email_config['smtp_encryption'] = empty($email_config['smtp_encryption']) ? null : $email_config['smtp_encryption'];

                        $transport = (new \Swift_SmtpTransport($email_config['smtp_host'], $email_config['smtp_port'], $email_config['smtp_encryption']))
                            ->setUsername($email_config['smtp_user'])
                            ->setPassword($email_config['smtp_pass']);

                        $transport->registerPlugin(new \Swift_Plugins_LoggerPlugin(static::getLogger()));
                        $stream_options = static::getStreamOptions();

                        if (!empty($stream_options)) {
                            $transport->setStreamOptions($stream_options);
                        }

                        $transport->start();
                    } catch (\Swift_TransportException $e) {
                        return static::handleFailure($e, $email_config['smtp_host'], $is_testing);
                    }
                }
                break;
            default:
                $transport = new \Swift_SendmailTransport();
                break;
        }

        return $transport;
    }

    /**
     * Handles Swift Transport Exceptions.
     *
     * @param \Swift_TransportException $e
     * @param string                    $expected_host The name of the SMTP server we tried connecting to.
     * @param boolean                   $is_testing    Whether we are testing email configs.
     *
     * @return false If the user is not testing their email configs.
     * @throws EmailHijackException If the user is being MITM'd while testing their email configs.
     * @throws \Swift_TransportException If the user is not being MITM'd and is just testing their email configs.
     */
    protected static function handleFailure(\Swift_TransportException $e, $expected_host, $is_testing) {
        if ($is_testing) {
            $logger = static::getLogger();

            # We're testing the email configs; throw the exception to let the user know what went wrong.

            # But first, let's make sure the server was not hijacked, and if it was, throw that instead.
            static::assertNotMitm($expected_host, $logger->dump());

            # Ok, so not being MITM'd. Return the real error.
            log_without_error("Log of SwiftMailer output: " . $logger->dump());
        }

        throw new EmailException($e->getMessage(), $e->getCode(), $e);
    }

    /**
     * Gets the SwiftMailer mailer for sending all email.
     *
     * @param array $email_config
     *
     * @return \Swift_Mailer
     */
    protected static function getMailer($email_config) {
        if (static::$mailer === null) {
            $CI = get_instance();
            $CI->load->model('settings_m');

            if (function_exists('mb_internal_encoding') && ((int) ini_get('mbstring.func_overload')) & 2) {
                $mbEncoding = mb_internal_encoding();
                mb_internal_encoding('ASCII');
            }

            static::$mailer = new \Swift_Mailer(static::getTransport($email_config));

            if (isset($mbEncoding)) {
                mb_internal_encoding($mbEncoding);
            }
        }

        return static::$mailer;
    }

    /**
     * Converts HTML into plaintext.
     *
     * @param string $html
     *
     * @return string
     */
    protected static function convertHtmlToText($html) {
        $html = new \Html2Text\Html2Text($html);
        return trim($html->getText());
    }

    /**
     * Creates and returns ready-to-use a SwiftMailer message.
     *
     * @param string $from
     *
     * @return \Swift_Message
     */
    protected static function getMessage($from = null) {
        $CI = get_instance();

        if (empty($from)) {
            $from_name = \Business::getBrandName();

            # Deal with notify email being a comma-separated list.
            $from = array_reset(explode(',', \Business::getNotifyEmail()));
        } else {
            $from = explode(" ", $from, 2);
            $from_name = (isset($from[1]) && !empty($from[1])) ? $from[1] : \Business::getBrandName();
            $from = $from[0];
        }

        $from = trim($from);

        if (empty($from)) {
            # Try to use the email of the first user as a last resort
            $CI->load->model('users/user_m');
            $from = array_reset(explode(',', $CI->user_m->get_default_email()));
        }

        if (empty($from)) {
            throw_exception("Could not find a valid From address.");
        }

        $reply_to = array($from => $from_name);
        $reply_to = $CI->dispatch_return('get_reply_to', $reply_to, 'array');

        # Deal with the modification of the array by dispatch_return().
        if (isset($reply_to[0]) && count($reply_to) == 1) {
            $reply_to = array_reset($reply_to);
        }

        $swift_message = new \Swift_Message();
        $swift_message->setFrom($from, $from_name);
        $swift_message->setReplyTo($reply_to);

        return $swift_message;
    }

    public static function processTo($to) {
        $return = [
            "to" => [],
            "failed_recipients" => [],
        ];

        if (!is_array($to)) {
            $to = array($to);
        }

        $buffer = $to;
        $to = array();
        foreach ($buffer as $recipient) {
            $to = array_merge($to, explode(",", $recipient));
        }

        foreach ($to as $recipient) {
            # Remove stray whitespace before/after email (happens if someone types for example "email@a, email@b").
            $recipient = trim($recipient);

            get_instance()->load->library('form_validation');

            if (get_instance()->form_validation->valid_email($recipient)) {
                $return["to"][] = $recipient;
            } else {
                $return["failed_recipients"][] = $recipient;
            }
        }

        return $return;
    }

    /**
     * Sends an email message.
     * If $unique_id and $item_type are specified, it will add a tracking image.
     * If $was_sent_to is specified, it will add BCC wording.
     *
     * @param array          $failed_recipients
     * @param array          $email_config
     * @param \Swift_Message $message
     * @param string         $subject
     * @param string         $contents
     * @param string         $to
     * @param string         $unique_id
     * @param string         $item_type
     * @param string         $was_sent_to
     *
     * @return int
     */
    protected static function sendMessage(&$failed_recipients, $email_config, \Swift_Message $message, $subject, $contents, $to, $unique_id = null, $item_type = null, $was_sent_to = null) {
        if (!empty($unique_id) and !empty($item_type)) {
            $tracking_image = "<img src='" . site_url("record_view/" . base64_encode($to) . "/$unique_id/$item_type") . "' alt='-' width='1' height='1' />";
        } else {
            $tracking_image = "";
        }

        if ($was_sent_to) {
            $bcc = __("global:bcc_was_sent_to", array($was_sent_to, format_date(time()))) . '<br /><hr /><br />';
        } else {
            $bcc = "";
        }

        $contents = str_ireplace('{{bcc}}', $bcc, $contents);
        $contents = str_ireplace('{{tracking_image}}', $tracking_image, $contents);

        $subject = $was_sent_to ? ("BCC - " . $subject) : $subject;

        # Remove all accidental HTML tags from the subject.
        $subject = strip_tags($subject);

        $message
            ->setTo($to)
            ->setSubject($subject)
            ->setBody($contents, 'text/html')
            ->addPart(static::convertHtmlToText($contents), 'text/plain');

        if ($email_config['email_config']['type'] == "gmail" && \Settings::get("gmail_email")) {
            $raw = rtrim(strtr(base64_encode($message->toString()), '+/', '-_'), '=');
            $gmail_email = new \Google_Service_Gmail_Message();
            $gmail_email->setRaw($raw);

            $client = new \Google_Client();
            $access_token = get_instance()->settings_m->get_google_access_token();
            $expires_in = time() - \Settings::get("gmail_expiry_timestamp");
            $client->setAccessToken([
                "access_token" => $access_token,
                "expires_in" => $expires_in,
            ]);

            /** @var \GuzzleHttp\Client $guzzle */
            $guzzle = $client->getHttpClient();
            $configs = $guzzle->getConfig();
            $stream_options = self::getStreamOptions();
            if (isset($stream_options["ssl"]["capath"])) {
                $configs["verify"] = $stream_options["ssl"]["capath"];
            }
            if (isset($stream_options["ssl"]["cafile"])) {
                $configs["verify"] = $stream_options["ssl"]["cafile"];
            }
            $guzzle = new \GuzzleHttp\Client($configs);
            $client->setHttpClient($guzzle);

            $service = new \Google_Service_Gmail($client);
            $email_id = null;

            try {
                $email = $service->users_messages->send('me', $gmail_email);
                $email_id = $email->getId();
            } catch (\Google_Service_Exception $e) {
                # Wait and try again, and if it fails, -then- quit.
                sleep(1);
                $email = $service->users_messages->send('me', $gmail_email);
                $email_id = $email->getId();
            }

            if ($email_id) {
                return 1;
            } else {
                $failed_recipients[] = $to;
                return 0;
            }
        } else {
            return static::getMailer($email_config)->send($message, $failed_recipients);
        }
    }

    protected static function sanitizeFilename($filename) {
        if (function_exists("mb_ereg_replace")) {
            $filename = mb_ereg_replace("([^\w\s\d\-_~,;\[\]\(\).])", '-', $filename);
            $filename = mb_ereg_replace("([\.]{2,})", '-', $filename);
            $filename = mb_ereg_replace("([-]{2,})", '-', $filename);
        } else {
            $filename = preg_replace("([^\w\s\d\-_~,;\[\]\(\).])", '-', $filename);
            $filename = preg_replace("([\.]{2,})", '-', $filename);
            $filename = preg_replace("([-]{2,})", '-', $filename);
        }
        return $filename;
    }

    /**
     * This function is used only by send_pancake_email().
     * Sends an email as given, without doing any processing.
     * BCCs the email if it's being sent to a client and the BCC setting is turned on.
     * If $from is not provided, the notify_email will be used.
     *
     * @param string|array $to
     * @param string       $subject
     * @param string       $message
     * @param null         $from
     * @param array        $attachments
     * @param string       $unique_id
     * @param string       $item_type
     * @param array        $email_config
     *
     * @return array|boolean [failed_recipients => array, num_sent => int] if success, false if not.
     */
    public static function sendRaw($to, $subject, $message, $from = null, $attachments = array(), $unique_id = '', $item_type = '', $email_config = null) {
        if (function_exists('mb_internal_encoding') && ((int) ini_get('mbstring.func_overload')) & 2) {
            $mbEncoding = mb_internal_encoding();
            mb_internal_encoding('ASCII');
        }

        $swift_message = self::getMessage($from);
        $email_config = static::getEmailConfigs($email_config);

        if (\Settings::get('enable_pdf_attachments')) {
            foreach ($attachments as $filename => $contents) {
                $filename = static::sanitizeFilename($filename);
                $swift_message->attach(new \Swift_Attachment($contents, $filename, "application/pdf"));
            }
        }

        $to = self::processTo($to);
        $failed_recipients = $to["failed_recipients"];
        $to = $to["to"];

        $send_bcc = !!\Settings::get('bcc');

        $num_sent = 0;
        foreach ($to as $recipient) {
            $num_sent += static::sendMessage($failed_recipients, $email_config, $swift_message, $subject, $message, $recipient, $unique_id, $item_type);
            $notify_emails = static::processTo(\Business::getNotifyEmail());
            $failed_recipients = array_merge($failed_recipients, $notify_emails["failed_recipients"]);
            $notify_emails = $notify_emails["to"];
            foreach ($notify_emails as $notify_email) {
                if ($recipient != $notify_email && $send_bcc) {
                    $num_sent += static::sendMessage($failed_recipients, $email_config, $swift_message, $subject, $message, $notify_email, $unique_id, $item_type, $recipient);
                }
            }
        }

        if (isset($mbEncoding)) {
            mb_internal_encoding($mbEncoding);
        }

        if ($num_sent > 0) {
            return array(
                "failed_recipients" => $failed_recipients,
                "num_sent" => $num_sent,
            );
        } else {
            if ($email_config["is_testing"]) {
                # We're testing the email configs; throw the exception to let the user know what went wrong:
                log_without_error("Log of SwiftMailer output: " . static::getLogger()->dump());
            }
            return false;
        }
    }

}