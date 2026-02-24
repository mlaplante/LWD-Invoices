<?php

use League\OAuth2\Client\Provider\GoogleUser;

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2010, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link           http://pancakeapp.com
 * @since          Version 1.0
 */
// ------------------------------------------------------------------------

/**
 * The admin controller for Settings
 *
 * @subpackage    Controllers
 * @category      Settings
 */
class Admin extends Admin_Controller {

    /**
     * Smart_csv_m
     *
     * @var Smart_csv_m
     */
    public $smart_csv_m;

    function __construct() {
        parent::__construct();

        is_admin() or access_denied();
    }

    function verify_integrity() {
        $this->load->model('upgrade/update_system_m');
        echo json_encode($this->update_system_m->verify_integrity());
    }

    function email_variables() {
        $current_language = $this->lang->current_language;
        $language_filename = APPPATH . "language/$current_language/email_variables.md";
        $english_filename = APPPATH . "language/english/email_variables.md";
        $markdown = file_exists($language_filename) ? file_get_contents($language_filename) : file_get_contents($english_filename);
        $parsedown = new Parsedown();
        $html = $parsedown->text($markdown);
        if ($this->input->is_ajax_request()) {
            echo $html;
        } else {
            $this->template->html = $html;
            $this->template->build("email_variables");
        }
    }

    function verify_gmail() {
        $data = [
            "gmail" => false,
        ];

        $email_config = $this->settings_m->interpret_email_settings();

        if ($email_config['type'] == "gmail" && \Settings::get("gmail_email")) {
            $client = new \Google_Client();
            $access_token = get_instance()->settings_m->get_google_access_token();
            $expires_in = time() - \Settings::get("gmail_expiry_timestamp");
            $client->setAccessToken([
                "access_token" => $access_token,
                "expires_in" => $expires_in,
            ]);

            $service = new \Google_Service_Gmail($client);

            /** @var \GuzzleHttp\Client $guzzle */
            $guzzle = $client->getHttpClient();
            $configs = $guzzle->getConfig();
            $stream_options = $this->settings_m->getStreamOptions();
            if (isset($stream_options["ssl"]["capath"])) {
                $configs["verify"] = $stream_options["ssl"]["capath"];
            }
            if (isset($stream_options["ssl"]["cafile"])) {
                $configs["verify"] = $stream_options["ssl"]["cafile"];
            }
            $guzzle = new \GuzzleHttp\Client($configs);
            $client->setHttpClient($guzzle);

            $result = $service->users->getProfile('me');

            $this->load->library('form_validation');

            if ($this->form_validation->valid_email($result->getEmailAddress())) {
                $data["gmail"] = true;
            }
        }

        echo json_encode($data, JSON_PRETTY_PRINT);
    }

    function verify_tls12() {
        $data = [
            "stripe" => false,
            "paypal" => false,
        ];

        \Stripe\Stripe::setApiKey("sk_test_BQokikJOvBiI2HlWgH4olfQ2");
        \Stripe\Stripe::$apiBase = "https://api.stripe.com";

        $this->load->config("stripe");
        $curlopts = $this->config->item('stripe_curlopts');
        $curl = new \Stripe\HttpClient\CurlClient($curlopts);

        \Stripe\ApiRequestor::setHttpClient($curl);

        try {
            \Stripe\Charge::all();
            $data["stripe"] = true;
        } catch (\Stripe\Error\ApiConnection $e) {
            $data["stripe"] = false;
        }

        $this->load->library("paypal_lib");
        $result = $this->paypal_lib->validate_ipn();
        if ($result || $this->paypal_lib->last_error == "IPN Validation Failed.") {
            $data["paypal"] = true;
        } else {
            $data["paypal"] = true;
        }

        echo json_encode($data, JSON_PRETTY_PRINT);
    }

    public function diagnostic_invoices() {
        $this->load->model("invoices/partial_payments_m", "ppm");
        $bad_due_date_invoices = $this->invoice_m->get_mismatched_due_dates();
        $updates = 0;

        if (isset($_POST["correct_due_date"])) {
            foreach ($_POST["correct_due_date"] as $unique_id => $action) {
                if (isset($bad_due_date_invoices[$unique_id])) {
                    switch ($action) {
                        case "invoice":
                            # Update all payments to match.
                            $payments = $this->ppm->getInvoicePartialPayments($unique_id);
                            $due_date = $bad_due_date_invoices[$unique_id]["due_date"];

                            foreach ($payments as $payment) {
                                $this->ppm->setPartialPayment($unique_id, $payment['key'], $payment['amount'], $payment['is_percentage'], $due_date, $payment['notes']);
                            }

                            $updates++;
                            break;
                        case "payment":
                            # Update the invoice's due date to match.
                            $this->invoice_m->fixInvoiceRecord($unique_id);
                            $updates++;
                            break;
                        default:
                            # Do nothing; leave as is.
                            break;
                    }
                }
            }

            if ($updates > 0) {
                $this->session->set_flashdata('success', "$updates invoices' due dates were updated.");
                redirect('admin/settings/diagnostic_invoices');
            }
        }

        $bad_due_date_invoices = $this->invoice_m->get_mismatched_due_dates();
        $this->template->bad_due_date_invoices = $bad_due_date_invoices;
        $this->template->build('diagnostic_invoices');
    }

    /**
     * Lets the user edit the settings
     *
     * @access    public
     * @return    void
     */
    public function index($action = '') {
        include APPPATH . 'modules/gateways/gateway.php';
        $this->load->library('form_validation');
        $this->load->model('settings_m');
        $this->load->model('store/store_m');
        $this->load->model('projects/project_task_statuses_m', 'statuses');
        $this->load->model('tickets/ticket_statuses_m', 'ticket_statuses');
        $this->load->model('tickets/ticket_priorities_m', 'ticket_priorities');
        $this->load->model('tax_m');
        $this->load->model('upgrade/update_system_m', 'update');
        $this->load->model('key_m');
        $this->load->model("business_identities_m");

        $this->form_validation->set_rules('language', 'Language', 'trim');

        $this->form_validation->set_error_delimiters('<span class="form_error">', '</span>');

        if ($_POST and IS_DEMO) {
            # Enforce sendmail and the demo license key.
            $_POST['email_server'] = "sendmail";
            $_POST['mailpath'] = "/usr/sbin/sendmail";
            unset($_POST['license_key']);
        }

        if ($this->form_validation->run()) {
            # Reset messages for the saving settings process.
            $this->template->messages = array();

            require_once APPPATH . 'modules/gateways/gateway.php';
            if (!Gateway::processSettingsInput($_POST['gateways'])) {
                $this->template->messages = array('error' => lang('gateways:errorupdating'));
            }
            unset($_POST['gateways']);

            # Store all filesystem settings in a single Pancake setting.
            \Pancake\Filesystem\Filesystem::storeAdapterSettings(isset($_POST['filesystem']) ? $_POST['filesystem'] : []);
            unset($_POST['filesystem']);

            $this->business_identities_m->processSettingsInput($_POST['businesses'], isset($_POST['businesses_new']) ? $_POST['businesses_new'] : array(), $_FILES['businesses'], isset($_FILES['businesses_new']) ? $_FILES['businesses_new'] : array());
            unset($_POST['businesses_new'], $_POST['businesses']);

            $email_template_post = $_POST['email_templates'];
            $this->load->model('email_settings_templates');
            $this->email_settings_templates->store($email_template_post);
            unset($_POST['email_templates']);

            $save_email = $this->settings_m->save_email_settings($_POST);

            if ($save_email === 'no_openssl') {
                $this->template->messages = array('error' => lang('settings:noopenssl'));
            } else {
                unset($_POST['email_server']);
                unset($_POST['smtp_host']);
                unset($_POST['smtp_user']);
                unset($_POST['smtp_pass']);
                unset($_POST['smtp_port']);
                unset($_POST['smtp_encryption']);
                unset($_POST['secure_smtp_host']);
                unset($_POST['secure_smtp_user']);
                unset($_POST['secure_smtp_pass']);
                unset($_POST['secure_smtp_port']);
                unset($_POST['tls_smtp_host']);
                unset($_POST['tls_smtp_user']);
                unset($_POST['tls_smtp_pass']);
                unset($_POST['tls_smtp_port']);
                unset($_POST['gapps_user']);
                unset($_POST['gapps_pass']);
                unset($_POST['gmail_user']);
                unset($_POST['gmail_pass']);
                unset($_POST['mailpath']);
            }

            if (IS_DEMO) {
                $_POST['language'] = "english";
            }

            $_POST['ftp_pasv'] = isset($_POST['ftp_pasv']);
            $_POST['bcc'] = isset($_POST['bcc']);
            $_POST['enable_pdf_attachments'] = isset($_POST['enable_pdf_attachments']);
            $_POST['autosave_proposals'] = isset($_POST['autosave_proposals']);
            $_POST['always_autosend'] = isset($_POST['always_autosend']);
            $_POST['hide_tax_column'] = isset($_POST['hide_tax_column']);
            $_POST['tax_transaction_fees'] = isset($_POST['tax_transaction_fees']);
            $_POST['include_time_entry_dates'] = isset($_POST['include_time_entry_dates']);
            $_POST['use_utf8_font'] = isset($_POST['use_utf8_font']);
            $_POST['always_https'] = isset($_POST['always_https']);

            if (!empty($_POST['ftp_user'])) {
                $ftp_test = $this->update->test_ftp($_POST['ftp_host'], $_POST['ftp_user'], $_POST['ftp_pass'], $_POST['ftp_port'], $_POST['ftp_path'], $_POST['ftp_pasv']);
                if (!$ftp_test) {
                    $this->template->messages = array('error' => $this->update->get_error());
                } else {
                    $_POST['ftp_path'] = (substr($_POST['ftp_path'], strlen($_POST['ftp_path']) - 1, 1) == '/') ? $_POST['ftp_path'] : $_POST['ftp_path'] . '/';
                }
            }

            if (isset($_POST['license_key']) and !IS_HOSTED and !IS_DEMO) {
                $_POST['license_key'] = trim($_POST['license_key']);
                if ($_POST['license_key'] != Settings::get('license_key')) {
                    if (get_url_contents(MANAGE_PANCAKE_BASE_URL . 'verify/key/' . $_POST['license_key']) !== 'valid') {
                        $this->template->messages = array('error' => __('settings:wrong_license_key'));
                    }
                }
            }

            if (isset($_POST['default_tax_id'])) {
                if (is_array($_POST['default_tax_id'])) {
                    $_POST['default_tax_id'] = implode(",", $_POST['default_tax_id']);
                }
            } else {
                $_POST['default_tax_id'] = "0";
            }

            // Taxes
            $tax_names = isset($_POST['tax_name']) ? $_POST['tax_name'] : array();
            $tax_values = isset($_POST['tax_value']) ? $_POST['tax_value'] : array();
            $tax_regs = isset($_POST['tax_reg']) ? $_POST['tax_reg'] : array();
            $tax_compounds = isset($_POST['tax_compound']) ? $_POST['tax_compound'] : array();
            $tax_update = $this->tax_m->update_taxes($tax_names, $tax_values, $tax_regs, $tax_compounds);
            $tax_insert = true;
            if (isset($_POST['new_tax_name'])) {
                $tax_insert = $this->tax_m->insert_taxes($_POST['new_tax_name'], $_POST['new_tax_value'], $_POST['new_tax_reg'], (isset($_POST['new_tax_compound']) ? $_POST['new_tax_compound'] : array()));
            }

            unset($_POST['tax_name'], $_POST['tax_value'], $_POST['tax_reg'], $_POST['tax_compound'], $_POST['new_tax_name'], $_POST['new_tax_value'], $_POST['new_tax_reg'], $_POST['new_tax_compound']);

            // Currencies

            if (isset($_POST['currency_format'])) {
                $_POST['currency_format'] = array_map(function ($value) {
                    return base64_decode($value);
                }, $_POST['currency_format']);
            } else {
                $_POST['currency_format'] = null;
            }

            if ($this->input->post('currency_name') AND $this->input->post('currency_code') AND $this->input->post('currency_rate')) {
                $this->currency_m->update_currencies($_POST['currency_name'], $_POST['currency_code'], $_POST['currency_rate'], $_POST['currency_format']);
            }
            $currency_insert = true;
            if ($this->input->post('new_currency_name')) {
                if (isset($_POST['new_currency_format'])) {
                    $_POST['new_currency_format'] = array_map(function ($value) {
                        return base64_decode($value);
                    }, $_POST['new_currency_format']);
                } else {
                    $_POST['new_currency_format'] = null;
                }

                $currency_insert = $this->currency_m->insert_currencies($_POST['new_currency_name'], $_POST['new_currency_code'], $_POST['new_currency_rate'], $_POST['new_currency_format']);
            }

            unset($_POST['currency_name'], $_POST['currency_code'], $_POST['currency_rate'], $_POST['new_currency_name'], $_POST['new_currency_code'], $_POST['new_currency_rate'], $_POST['currency_format'], $_POST['new_currency_format']);

            // API Keys

            if ($this->input->post('key_key') AND $this->input->post('key_note')) {
                $this->key_m->update_keys($this->input->post('key_key'), $this->input->post('key_note'));
            }
            if ($this->input->post('new_key')) {
                $this->key_m->insert_keys($this->input->post('new_key'), $this->input->post('new_key_note'));
            }

            unset($_POST['key_key'], $_POST['key_note'], $_POST['new_key'], $_POST['new_key_note']);

            // Statuses

            if (!isset($_POST['statuses'])) {
                $_POST['statuses'] = array();
            }

            if (!isset($_POST['new_statuses'])) {
                $_POST['new_statuses'] = array();
            }

            if (count($_POST['statuses']) > 0) {
                foreach ($this->statuses->get_all() as $row) {
                    if (!isset($_POST['statuses'][$row->id])) {
                        $this->statuses->delete($row->id);
                    } else {
                        $this->statuses->update($row->id, $_POST['statuses'][$row->id]);
                    }
                }
            }
            if (count($_POST['new_statuses']) > 0) {
                foreach ($_POST['new_statuses']['title'] as $key => $title) {
                    $this->statuses->insert(array(
                        'title' => $title,
                        'background_color' => $_POST['new_statuses']['background_color'][$key],
                        'font_color' => $_POST['new_statuses']['font_color'][$key],
                        'text_shadow' => $_POST['new_statuses']['text_shadow'][$key],
                        'box_shadow' => $_POST['new_statuses']['box_shadow'][$key],
                    ));
                }
            }

            unset($_POST['new_statuses'], $_POST['statuses']);

            // Ticket Statuses

            if (!isset($_POST['ticket_statuses'])) {
                $_POST['ticket_statuses'] = array();
            }

            if (!isset($_POST['new_ticket_statuses'])) {
                $_POST['new_ticket_statuses'] = array();
            }

            if (count($_POST['ticket_statuses']) > 0) {
                foreach ($this->ticket_statuses->get_all() as $row) {
                    if (!isset($_POST['ticket_statuses'][$row->id])) {
                        $this->ticket_statuses->delete($row->id);
                    } else {
                        $this->ticket_statuses->update($row->id, $_POST['ticket_statuses'][$row->id]);
                    }
                }
            }
            if (count($_POST['new_ticket_statuses']) > 0) {
                foreach ($_POST['new_ticket_statuses']['title'] as $key => $title) {
                    $this->ticket_statuses->insert(array(
                        'title' => $title,
                        'background_color' => $_POST['new_ticket_statuses']['background_color'][$key],
                        'font_color' => $_POST['new_ticket_statuses']['font_color'][$key],
                        'text_shadow' => $_POST['new_ticket_statuses']['text_shadow'][$key],
                        'box_shadow' => $_POST['new_ticket_statuses']['box_shadow'][$key],
                    ));
                }
            }

            unset($_POST['new_ticket_statuses'], $_POST['ticket_statuses']);

            // Ticket Priorities

            if (!isset($_POST['ticket_priorities'])) {
                $_POST['ticket_priorities'] = array();
            }

            if (!isset($_POST['new_ticket_priorities'])) {
                $_POST['new_ticket_priorities'] = array();
            }

            if (count($_POST['ticket_priorities']) > 0) {
                foreach ($this->ticket_priorities->get_all() as $row) {
                    if (!isset($_POST['ticket_priorities'][$row->id])) {
                        $this->ticket_priorities->delete($row->id);
                    } else {
                        $_POST['ticket_priorities'][$row->id]["default_rate"] = process_number($_POST['ticket_priorities'][$row->id]["default_rate"]);
                        $this->ticket_priorities->update($row->id, $_POST['ticket_priorities'][$row->id]);
                    }
                }
            }
            if (count($_POST['new_ticket_priorities']) > 0) {
                foreach ($_POST['new_ticket_priorities']['title'] as $key => $title) {
                    $this->ticket_priorities->insert(array(
                        'title' => $title,
                        'background_color' => $_POST['new_ticket_priorities']['background_color'][$key],
                        'font_color' => $_POST['new_ticket_priorities']['font_color'][$key],
                        'text_shadow' => $_POST['new_ticket_priorities']['text_shadow'][$key],
                        'box_shadow' => $_POST['new_ticket_priorities']['box_shadow'][$key],
                        'default_rate' => process_number($_POST['new_ticket_priorities']['default_rate'][$key]),
                    ));
                }
            }

            unset($_POST['new_ticket_priorities'], $_POST['ticket_priorities']);

            if (!isset($this->template->messages['error']) or empty($this->template->messages['error'])) {
                if ($this->settings_m->update_settings($_POST) AND $tax_update AND $tax_insert) {
                    $this->template->messages = array('success' => __("settings:have_been_updated"));
                    $default_notify_email = Business::getNotifyEmail();

                    if (empty($default_notify_email)) {
                        $this->template->messages = array('error' => __("settings:no_notify_email", array(site_url("admin/settings#identities"))));
                    }
                } else {
                    $this->template->messages = array('error' => 'There was an error updating your settings.  Please contact support.');
                }
            }
        }

        $this->load->model('email_settings_templates');
        $this->template->email_templates = $this->email_settings_templates->get();

        $this->template->latest_version = Settings::get('latest_version');
        $this->template->outdated = ($this->template->latest_version != '0' and $this->template->latest_version != Settings::get('version'));
        $this->template->conflicted_files = $this->template->outdated ? $this->update->check_for_conflicts() : [];
        try {
            $this->template->changelog = $this->update->get_changelog(true);
        } catch (\Pancake\Update\DownloadException $e) {
            $this->template->changelog = "";
        }
        $this->template->update = $this->update;

        $settings = array();
        foreach (Settings::get_all_including_sensitive() as $name => $value) {
            $settings[$name] = set_value($name, $value);
        }

        // Populate currency dropdown
        $currencies = array();
        foreach (Currency::currencies() as $code => $currency) {
            $currencies[$code] = $currency['name'] . ' (' . $code . ')';
        }

        $this->template->import_types = array(
            'invoices' => __('global:invoices'),
            'estimates' => __('global:estimates'),
            'credit_notes' => __('global:credit_notes'),
            'expenses' => __('expenses:expenses'),
            'clients' => __('global:clients'),
            'projects' => __('global:projects'),
            'tasks' => __('global:tasks'),
            'time_entries' => __('global:time_entries'),
            'users' => __('global:users'),
        );
        $this->template->export_types = array(
            'invoices_csv' => __('export:invoices_csv'),
            'expenses_csv' => __('export:expenses_csv'),
            'clients_csv' => __('export:clients_csv'),
            #'proposals' => __('global:proposals'),
            #'estimates' => __('global:estimates'),
            #'clients' => __('global:clients'),
            #'projects' => __('global:projects'),
            #'time_entries' => __('global:time_entries'),
            #'users' => __('global:users'),
        );
        $this->template->languages = $this->settings_m->get_languages();

        if (IS_DEMO) {
            # Hide license key in demo.
            $settings['license_key'] = 'demo-license-key';
        }

        $this->template->currencies = $currencies;
        $this->template->settings = array_map(function ($setting) {
            return html($setting);
        }, $settings);
        $this->template->api_keys = $this->key_m->get_all();
        $this->template->email_inputs = $this->settings_m->inputs;
        $this->template->guessed_ftp_host = parse_url(site_url(), PHP_URL_HOST);

        $this->template->email_servers = array(
            'gmail' => 'Gmail / Google Apps',
            'smtp' => 'SMTP',
            'default' => __("global:server_default"),
        );

        $email = $this->settings_m->interpret_email_settings();

        if ($email['type'] == 'gmail') {
            $email['smtp_host'] = 'smtp.gmail.com';
        }

        $email = array(
            'type' => isset($_POST['email_server']) ? $_POST['email_server'] : $email['type'],
            'smtp_host' => isset($_POST['smtp_host']) ? $_POST['smtp_host'] : $email['smtp_host'],
            'smtp_user' => isset($_POST['smtp_user']) ? $_POST['smtp_user'] : $email['smtp_user'],
            'smtp_pass' => isset($_POST['smtp_pass']) ? $_POST['smtp_pass'] : $email['smtp_pass'],
            'smtp_port' => isset($_POST['smtp_port']) ? $_POST['smtp_port'] : $email['smtp_port'],
            'smtp_encryption' => isset($_POST['smtp_encryption']) ? $_POST['smtp_encryption'] : $email['smtp_encryption'],
            'gmail_user' => isset($_POST['gmail_user']) ? $_POST['gmail_user'] : $email['gmail_user'],
            'gmail_pass' => isset($_POST['gmail_pass']) ? $_POST['gmail_pass'] : $email['gmail_pass'],
        );

        $this->template->email = $email;

        $this->template->temporary_no_internet_access = defined('TEMPORARY_NO_INTERNET_ACCESS');

        $this->template->task_statuses = (array) $this->statuses->get_all();
        $this->template->ticket_statuses = (array) $this->ticket_statuses->get_all();

        $ticket_statuses_dropdown = array(
            '0' => __('settings:never_send_ticket_invoices_automatically'),
        );
        foreach ($this->template->ticket_statuses as $ticket_status) {
            $ticket_statuses_dropdown[$ticket_status->id] = $ticket_status->title;
        }
        $this->template->ticket_statuses_dropdown = $ticket_statuses_dropdown;

        $this->template->ticket_priorities = (array) $this->ticket_priorities->get_all();

        $this->template->outdated_plugins = $this->store_m->get_outdated_details();

        $this->template->businesses = $this->business_identities_m->getAllBusinesses();

        $this->template->error_logs = $this->db->select("id, subject, notification_email, is_reported, error_id, is_reportable, occurrences, first_occurrence", false)->order_by("first_occurrence", "desc")->get("error_logs")->result_array();

        $this->template->build('index');
    }

    function view_error($error_id) {
        $error = $this->db->where("id", $error_id)->get("error_logs")->row_array();
        echo $error['contents'];
    }

    function delete_error($error_id) {
        if ($this->db->where("id", $error_id)->delete("error_logs")) {
            echo "OK";
        } else {
            echo "NOTOK";
        }
    }

    public function export() {
        if (filter_has_var(INPUT_POST, "export_type")) {
            $this->load->helper("file");
            $export_type = filter_input(INPUT_POST, "export_type", FILTER_SANITIZE_STRING);
            $this->load->model('pie_m', 'pie');
            $contents = $this->pie->export($export_type);
            $filename = $contents['filename'];
            if ($filename) {
                $contents = $contents['contents'];
                $extension = pathinfo($filename, PATHINFO_EXTENSION);
                $extension = $extension ? $extension : "txt";
                $export_type = str_replace(strrchr($export_type, '_'), "", $export_type);
                header('Content-type: ' . get_mime_by_extension("file." . $extension));

                if (!IS_DEBUGGING) {
                    header('Pragma: public');
                    header('Content-disposition: attachment;filename=' . $export_type . '.' . $extension);
                }
                echo $contents;
            } else {
                redirect("admin/settings#importexport");
            }
        } else {
            redirect("admin/settings#importexport");
        }
    }

    public function import() {
        $this->load->model('pie_m', 'pie');

        if (isset($_POST['processed_import_data'])) {
            $this->load->model('smart_csv_m');
            $import_type = isset($_POST['import_type']) ? $_POST['import_type'] : 'clients';
            $records = json_decode($_POST['processed_import_data'], true);
            $import = $this->smart_csv_m->import($records, $import_type);
            if ($import) {
                $success = __('settings:imported' . $import_type, array($import['count']));
                if ($import['duplicates'] > 0) {
                    $success .= ' ' . __('settings:xwereduplicates', array($import['duplicates']));
                }
                $this->session->set_flashdata('success', $success);
                redirect('admin/settings');
            } else {
                return $this->_smartcsv();
            }
        }

        if (isset($_FILES['file_to_import']) and $_FILES['file_to_import']['error'][0] != 0) {
            switch ($_FILES['file_to_import']['error'][0]) {
                case 1:
                    # global:upload_ini_size
                    $this->session->set_flashdata('error', __('global:upload_ini_size'));
                    redirect('admin/settings#importexport');
                    break;
                case 4:
                    # settings:nouploadedimportfile
                    $this->session->set_flashdata('error', __('settings:nouploadedimportfile'));
                    redirect('admin/settings#importexport');
                    break;
                default:
                    # global:upload_error
                    $this->session->set_flashdata('error', __('global:upload_error'));
                    redirect('admin/settings#importexport');
                    break;
            }
        } elseif (!isset($_FILES['file_to_import'])) {
            redirect('admin/settings#importexport');
        }

        $import_type = $_POST['import_type'];
        $filename = $_FILES['file_to_import']['tmp_name'][0];
        $ext = strtolower(pathinfo($_FILES['file_to_import']['name'][0], PATHINFO_EXTENSION));
        $import = $this->pie->import($import_type, $filename, $ext);

        if (!$import) {
            if ($this->pie->process($filename, $ext)) {
                return $this->_smartcsv();
            } else {
                $this->template->import_failed = true;
                $this->template->import = true;
                $this->template->build('import_failed');
            }
        } else {
            if ($import) {
                # Everything's perfect.
                $success = array();
                foreach ($import as $type => $details) {
                    $buffer = __('settings:imported' . $type, array($details['count']));
                    if ($details['duplicates'] > 0) {
                        $buffer .= ' ' . __('settings:xwereduplicates', array($details['duplicates']));
                    }
                    $success[] = $buffer;
                }
                $success = implode("<br />", $success);

                $this->session->set_flashdata('success', $success);
                redirect('admin/settings');
            }
        }
    }

    public function test_email() {
        try {

            $return = array();
            $to = array_reset(explode(',', Business::getBillingEmail()));
            $return['to'] = $to;

            if (!empty($_POST)) {
                $data = $this->settings_m->convert_input_to_settings($_POST);
                $email_config = $this->settings_m->interpret_email_settings($data);
            } else {
                $email_config = $this->settings_m->interpret_email_settings();
            }

            if ($email_config['type'] != "default" && $email_config['type'] != "gmail") {
                # Check that the firewall allows connections to this port:
                $errno = 0;
                $errstr = "";
                $fp = @fsockopen(($email_config['smtp_encryption'] == 'ssl' ? 'ssl://' : '') . $email_config['smtp_host'], $email_config['smtp_port'], $errno, $errstr, 5);

                if (!$fp) {
                    $return['success'] = false;
                    $return['error'] = __("settings:test_email_connection_error", array(array_end(explode("://", $email_config['smtp_host'])), $email_config['smtp_port'], "$errstr (Error Number: $errno)"));
                    echo json_encode($return);
                    return;
                }
            }

            $result = \Pancake\Email\Email::sendRaw($to, __("settings:test_email_subject"), __("settings:test_email_message"), null, array(), '', '', $email_config);
            if ($result) {
                $return['success'] = true;
            } else {
                $return['success'] = false;
                $return['error'] = __("error:subtitle");
            }
        } catch (\Pancake\Email\EmailHijackException $e) {
            $return['success'] = false;
            $return['error'] = __("settings:hijacked_error", [
                "<strong>" . $e->getExpectedHost() . "</strong>",
                "<strong>" . $e->getActualHost() . "</strong>",
            ]);
        } catch (Exception $e) {
            $return['success'] = false;
            $return['error'] = __("settings:test_email_error", array($e->getMessage()));
        }

        echo json_encode($return);
    }

    public function oauth2gmail() {
        $this->load->config("oauth2_gmail");
        $client_id = $this->config->item("google_client_id");

        if (!empty($_GET['error'])) {
            # If there was a Google error.
            $this->settings_m->unset_google_settings();
            if ($_GET['error'] == "access_denied") {
                $this->session->set_flashdata('error', __("settings:gmail_access_denied"));
                redirect('admin/settings');
            } else {
                throw new Exception("Google oAuth Error: " . $_GET['error']);
            }
        }

        if (!empty($client_id)) {
            $provider = new League\OAuth2\Client\Provider\Google([
                'clientId' => $this->config->item("google_client_id"),
                'clientSecret' => $this->config->item("google_client_secret"),
                'redirectUri' => site_url("admin/settings/oauth2gmail"),
                'accessType' => 'offline',
            ]);

            if (empty($_GET['code'])) {
                # If we don't have an authorization code, then get one.
                $authUrl = $provider->getAuthorizationUrl([
                    'approval_prompt' => 'force',
                    'scope' => ["https://www.googleapis.com/auth/gmail.send", "email"],
                ]);

                $this->session->set_userdata("oauth2state", $provider->getState());
                header('Location: ' . $authUrl);
            } elseif (empty($_GET['state']) || ($_GET['state'] !== $this->session->userdata("oauth2state"))) {
                # State is invalid, possible CSRF attack in progress.
                $oauth2state = $this->session->userdata("oauth2state");
                $this->session->unset_userdata("oauth2state");
                throw new Exception("Invalid state, possible CSRF attack in progress.\n\nOld State: " . $oauth2state . "\n\nNew State: " . $_GET['state']);
            } else {
                # Try to get an access token (using the authorization code grant).
                $token = $provider->getAccessToken('authorization_code', [
                    'code' => $_GET['code'],
                ]);

                $refresh_token = $token->getRefreshToken();
                if (!empty($refresh_token)) {
                    $url = "https://openidconnect.googleapis.com/v1/userinfo";
                    $response = $provider->getParsedResponse($provider->getAuthenticatedRequest("GET", $url, $token));
                    $owner_details = new GoogleUser($response);

                    $email = $owner_details->getEmail();
                    $this->session->unset_userdata("oauth2state");
                    $this->settings_m->set_google_settings($email, $token->getToken(), $token->getRefreshToken(), $token->getExpires());
                    $this->session->set_flashdata('success', __("settings:gmail_setup_successfully"));
                    redirect('admin/settings');
                } else {
                    throw_exception("No valid token obtained!", $token);
                }
            }
        } else {
            $this->settings_m->set_google_settings($_REQUEST["email"], $_REQUEST["access_token"], $_REQUEST["refresh_token"], $_REQUEST["token_expires"]);
            $this->session->set_flashdata('success', __("settings:gmail_setup_successfully"));
            redirect('admin/settings');
        }
    }

    public function _smartcsv() {
        $this->load->model('smart_csv_m');

        $import_type = isset($_POST['import_type']) ? $_POST['import_type'] : 'clients';

        if (isset($_FILES['file_to_import']['tmp_name'][0])) {
            $filename = $_FILES['file_to_import']['tmp_name'][0];
            $import_data = $this->pie->process($filename, pathinfo($_FILES['file_to_import']["name"][0], PATHINFO_EXTENSION), true);
        } else {
            if (isset($_POST['processed_import_data'])) {
                $processed_import_data = json_decode($_POST['processed_import_data'], true);
                $processed_field_data = json_decode($_POST['processed_field_data'], true);
                $import_data = json_decode(base64_decode($_POST['import_data']), true);
            } else {
                redirect('settings#importexport');
            }
        }

        $this->template->required_errors = $this->smart_csv_m->get_required_errors();
        $this->template->invalid_errors = $this->smart_csv_m->get_invalid_errors();
        $this->template->errored = $this->smart_csv_m->errored();
        $this->template->pancake_fields = $this->smart_csv_m->get_fields($import_type);
        $this->template->textareas = $this->smart_csv_m->get_textareas($import_type);
        $this->template->required_fields = $this->smart_csv_m->get_requireds($import_type);
        $this->template->types = $this->smart_csv_m->get_field_types($import_type);
        $this->template->import_data = $import_data;
        $this->template->processed_import_data = isset($processed_import_data) ? $processed_import_data : array();
        $this->template->processed_field_data = isset($processed_field_data) ? $processed_field_data : array();
        $this->template->import_type = $import_type;
        $match_data = $this->smart_csv_m->match_fields($this->template->pancake_fields, $this->template->import_data["fields"]);
        $this->template->mapping = $match_data["mapping"];
        $this->template->payments_to_show = $match_data["payments_to_show"];
        $this->template->items_to_show = $match_data["items_to_show"];

        $fields = array();
        foreach (array_keys($this->template->pancake_fields) as $row) {
            $fields[$row] = "";
        }

        $this->template->initial_fields = json_encode($fields);
        $this->template->build('smart_csv');
    }

}

/* End of file: admin.php */