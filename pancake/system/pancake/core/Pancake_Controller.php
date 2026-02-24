<?php

use Pancake\Navigation;

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
 * The admin and public base controllers extend this library
 *
 * @subpackage    Controllers
 * @property      Clients_m                     $clients_m
 * @property      Invoice_m                     $invoice_m
 * @property      Project_m                     $project_m
 * @property      CI_Loader                     $load
 * @property      Project_task_m                $project_task_m
 * @property      Update_system_m               $update
 * @property      Store_m                       $store_m
 * @property      CI_DB_query_builder           $db
 * @property      Template                      $template
 * @property      User_m                        $user_m
 * @property      Business_identities_m         $business_identities_m
 * @property      Settings_m                    $settings_m
 * @property      Currency_m                    $currency_m
 * @property      Partial_payments_m            $ppm
 * @property      Project_expense_m             $project_expense_m
 * @property      Clients_credit_alterations_m  $clients_credit_alterations_m
 * @property      CI_Benchmark                  $benchmark
 * @property      Update_system_m               $update_system_m
 * @property      Proposals_m                   $proposals_m
 * @property      \Pancake\Mustache\Mustache    $mustache
 * @property      Ion_auth                      $ion_auth
 * @property      CI_Config                     $config
 * @property      CI_Session                    $session
 * @property      Project_time_m                $project_time_m
 * @property      Files_m                       $files_m
 * @property      CI_Form_validation            $form_validation
 * @property      Assignments                   $assignments
 * @property      Pie_m                         $pie
 * @property      Expenses_categories_m         $expenses_categories_m
 * @property      Expenses_suppliers_m          $expenses_suppliers_m
 * @property      Paypal_lib                    $paypal_lib
 * @property      Project_template_m            $project_template_m
 * @property      Notification_m                $notification_m
 * @property      CI_Input                      $input
 * @property      Kitchen_comment_m             $kitchen_comment_m
 * @property      Ticket_statuses_m             $ticket_statuses_m
 * @property      Client_support_rates_matrix_m $client_support_rates_matrix_m
 * @property      Email_settings_templates      $email_settings_templates
 * @property      Plugins_m                     $plugins_m
 * @property      Ticket_m                      $ticket_m
 * @property      Ticket_post_m                 $ticket_post_m
 * @property      Ticket_history_m              $ticket_history_m
 * @property      Kitchen_files_m               $kitchen_files_m
 * @property      Reports_m                     $reports_m
 * @property      Clients_taxes_m               $clients_taxes_m
 * @property      Clients_meta_m                $clients_meta_m
 * @property      CI_Output                     $output
 * @property      CI_DB_forge                   $dbforge
 * @property      CI_Router                     $router
 * @property      Tax_m                         $tax_m
 * @property      Contact_m                     $contact_m
 * @property Ion_auth_model $ion_auth_model
 */
#[AllowDynamicProperties]
class Pancake_Controller extends CI_Controller {


    /**
     * @var array    An array of methods to be secured by login
     */
    protected $secured_methods = array();

    // ------------------------------------------------------------------------

    /**
     * The construct loads sets up items needed application wide.
     *
     * @access    public
     * @return    void
     */
    public function __construct() {
        global $post_buffer;

        parent::__construct();

        $this->benchmark->mark('pancake_controller_construct_start');

        # This is here because it somehow makes all strict errors appear.
        # Don't. Even. Ask.
        @$undefined_var++;

        # @ is used here to prevent errors with some of the stricter hosts who disable ini_set.
        # We hide the errors here because CI has loaded, and we can rely on the Exceptions engine to display errors for us.
        @ini_set('display_errors', false);

        # Fixes a white-page error if the "dbprefix" configuration is incorrect.
        if ($this->db->query("show tables like " . $this->db->escape($this->db->dbprefix("settings")))->num_rows() == 0) {
            $message = "";
            $message .= "<p>Your configurations specify that the table prefix is <code>{$this->db->dbprefix}</code>, but no tables were found with that prefix.</p>";
            $message .= "<p>You should look at the <code>system/pancake/config/database.php</code> file and make sure to correct the table prefix.</p>";
            $message .= "<p>By default it's <code>pancake_</code>, but you might have changed it when installing Pancake.</p>";
            critical_error("Pancake cannot load.", $message);
        }

        # Get rid of all wait_timeout issues.
        $this->db->query("set @@wait_timeout=3600");

        # Disable all caching.
        header("Expires: Mon, 26 Jul 1997 05:00:00 GMT");
        header("Last-Modified: " . gmdate("D, d M Y H:i:s") . " GMT");
        header("Cache-Control: private");
        header("Pragma: no-cache");

        # This is here so that any strict errors that these cause appear, thanks to the above statement.
        $this->load->library(array('PAN', 'settings/settings', 'currency', 'template', 'asset', 'search', 'events'));
        $this->load->helper(array('form', 'date', 'text', 'ion_auth', 'pancake_notifications', 'pancake', 'pancake_logger', 'pancake_assignments', 'typography'));

        // Disable query logging, which can cause memory_limit fatal errors when trying
        // to perform large updates. If you need the queries to show up in the profiler,
        // set this to TRUE.
        $this->db->save_queries = IS_PROFILING || IS_DEBUGGING;
        $this->output->enable_profiler(IS_PROFILING);

        $this->method = $this->router->fetch_method();

        $migrations = APPPATH . "migrations/";
        if (file_exists("{$migrations}131_Bump_to_3_6_8.php") && file_exists("{$migrations}131_Reserved_1.php")) {
            unlink("{$migrations}131_Bump_to_3_6_8.php");
        }

        if (file_exists("{$migrations}246_Improve_project_templates.php") && file_exists("{$migrations}246_Improve_project_templates_second_time.php")) {
            unlink("{$migrations}246_Improve_project_templates.php");
        }

        // Migrate DB to the latest version
        $this->load->library('migration');
        $this->load->model('upgrade/upgrade_m');

        $versions_without_migrations = array('1.0', '1.1', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '2.0', '2.0.1', '2.0.2', '2.0.3');
        # 2.1.0 does not have migrations but can be migrated.

        if (!in_array(PAN::setting('version'), $versions_without_migrations)) {
            if (!$this->migration->latest()) {
                throw new Exception($this->migration->error_string());
            }
        } else {
            $this->upgrade_m->start();
        }

        # Get the latest version if it's been 12 hours since the last time.
        # Automatically update Pancake, if the settings are set to that.
        $this->load->model('upgrade/update_system_m', 'update');
        if ($this->method != 'no_internet_access') {
            $this->update->get_latest_version();
        }
        # If Pancake was just automatically updated, the update system will force a refresh.
        # So by the time it gets here, the NEW Pancake will be running, and the migrations will have run.

        $this->mustache = new Pancake\Mustache\Mustache();

        # Force the user to use Pancake via HTTPS.
        if (Settings::get("always_https") and !IS_SSL) {
            redirect(str_ireplace('http://', 'https://', site_url(uri_string())));
        }

        $this->load->library('session', ["encryption_key" => Settings::get_encryption_key()]);
        $this->load->library('ion_auth');

        Currency::set(PAN::setting('currency'));

        # Load english first, to cache it.
        switch_language('english');

        switch_language(Settings::get('language'));

        $this->load->model('users/user_m');
        $this->current_user = $this->template->current_user = $this->ion_auth->get_user();

        $this->load->model(array(
            'users/permission_m',
            'module_m',
            'notifications/notification_m',
        ));

        // List available module permissions for this user
        $this->permissions = $this->current_user ? $this->permission_m->get_group($this->current_user->group_id) : array();

        // ! empty($this->permissions['users']['']);

        // Get meta data for the module
        $this->template->module_details = $this->module_details = $this->module_m->get($this->router->fetch_module());

        $this->template->title($this->_guess_title());

        $default_notify_email = Business::getNotifyEmail();
        if (empty($default_notify_email)) {
            $this->template->messages = array('error' => __("settings:no_notify_email", array(site_url("admin/settings#identities"))));
        }

        Swift_Preferences::getInstance()->setTempDir(PANCAKE_TEMP_DIR);

        log_message('debug', "Pancake_Controller Class Initialized");

        if (empty($post_buffer) && !empty($_POST)) {
            # $_POST was fixed by FixPhpPostInput, so the variable needs to be reinitialised.
            $post_buffer = $_POST;
        }

        $_POST = $this->process_input($_POST, $post_buffer);
        unset($post_buffer);

        $this->setupNavbar();
        $this->setupQuickLinks();

        $this->load->library('plugins');
        $this->plugins->load_all();

        if (isset($_SERVER['QUERY_STRING']) and !empty($_SERVER['QUERY_STRING'])) {
            if (empty($_GET)) {
                # $_GET (and thus, $_REQUEST as well) is getting screwed by .htaccess, fill it up with the right data:
                parse_str($_SERVER['QUERY_STRING'], $_GET);
                $_REQUEST = $_REQUEST + $_GET;
            }
        }

        $this->benchmark->mark('pancake_controller_construct_end');
    }

    public function process_input($post, $post_buffer) {
        $return = array();

        foreach ($post as $key => $item) {
            if (is_array($item)) {
                $item = $this->process_input($item, $post_buffer[$key]);
            } else {
                # Use @ to hide deprecation notice in PHP 7.4.
                if (function_exists('get_magic_quotes_gpc') && @get_magic_quotes_gpc()) {
                    $post_buffer[$key] = stripslashes($post_buffer[$key]);
                }

                if (strpos($post_buffer[$key], "\r") !== false) {
                    $post_buffer[$key] = str_replace(array("\r\n", "\r", "\r\n\n"), PHP_EOL, $post_buffer[$key]);
                }

                $item = $post_buffer[$key];
            }

            $return[$key] = $item;
        }

        return $return;
    }

    /**
     * Fills the navbar with all of Pancake's links, labels and dividers.
     * This is the place where you should add new links to the navbar, using the Navigation API.
     */
    protected function setupNavbar() {
        if ($this->current_user) {
            $uri_string = uri_string();

            $this->load->model('projects/project_m');
            $this->load->model('projects/project_time_m');
            $this->load->model('projects/project_timers_m', 'ptm');

            $project_nav_timers = $this->project_m->get_navbar_timers();

            $timers = $this->ptm->get_running_timers();
            $this->template->timers = $timers;

            if (can_for_any_client('read', 'project_tasks')) {

                Navigation::registerNavbarLink("#timers", "global:timers");

                Navigation::registerNavbarLink("admin/projects/app", "global:timer_app", "#timers");
                Navigation::setClass("admin/projects/app", "open-timer-app");

                Navigation::registerNavbarLink("admin/timesheets", "global:timesheets", "#timers");


                $timers_set = array();

                if (count($timers) > 0) {
                    Navigation::setBadge("#timers", count($timers));
                    Navigation::registerNavbarLabel("tasks:timers_running", "#timers");
                    foreach ($timers as $task_id => $task) {
                        $task['id'] = $task['task_id'];
                        $task_id = "#timers-task-" . $task['id'];
                        Navigation::registerNavbarLink($task_id, $task['project_name'] . " &ndash; " . $task['task_name'], "#timers");
                        Navigation::registerNavbarLink("#timers-timer-" . $task['id'], 'global:stop_timer', $task_id);
                        Navigation::setClass("#timers-timer-" . $task['id'], "timer-button stop");
                        Navigation::setContainerClass("#timers-timer-" . $task['id'], "timer navtimer");
                        Navigation::setContainerDataAttributes("#timers-timer-" . $task['id'], get_timer_attrs($timers, $task['id']));
                        $timers_set[] = $task['id'];
                    }
                    Navigation::registerDivider("#timers");
                }


                if (count($project_nav_timers) > 0) {
                    Navigation::registerNavbarLabel("global:projects", "#timers");

                    $i = 0;
                    foreach ($project_nav_timers as $project) {
                        if ($i == 10) {
                            break;
                        }

                        $project_id = "#timers-project-" . $project->id;
                        Navigation::registerNavbarLink($project_id, $project->name, "#timers");
                        $sub_i = 0;
                        foreach ($project->tasks as $task) {
                            if ($sub_i == 10) {
                                break;
                            }

                            $task_id = $task['id'];
                            if (in_array($task_id, $timers_set)) {
                                continue;
                            }

                            $task_url_id = "#timers-task-" . $task_id;
                            Navigation::registerNavbarLink($task_url_id, $task['name'], $project_id);
                            Navigation::registerNavbarLink("#timers-timer-" . $task_id, 'global:start_timer', $task_url_id);
                            Navigation::setClass("#timers-timer-" . $task_id, "timer-button play");
                            Navigation::setContainerClass("#timers-timer-" . $task_id, "timer navtimer");
                            Navigation::setContainerDataAttributes("#timers-timer-" . $task_id, get_timer_attrs($timers, $task_id));
                            $sub_i++;
                        }

                        if (count($project->tasks) != $sub_i) {
                            Navigation::registerNavbarLabel(__("global:tasks_ommitted", array((count($project->tasks) - $sub_i))), $project_id);
                        }

                        $i++;
                    }

                    if (count($project_nav_timers) != $i) {
                        Navigation::registerNavbarLabel(__("global:projects_ommitted", array((count($project_nav_timers) - $i))), "#timers");
                    }
                }
            }

            $is_estimate_url = (stripos($uri_string, "admin/invoices/estimates") !== false or stripos($uri_string, "admin/estimates") !== false);
            $is_invoice_url = (stripos($uri_string, "admin/invoices") !== false or stripos($uri_string, "admin/items") !== false);
            $is_credit_notes_url = (stripos($uri_string, "admin/invoices/credit_notes") !== false or stripos($uri_string, "admin/credit_notes") !== false);

            if (can_for_any_client('read', 'invoices')) {
                Navigation::registerNavbarLink("#invoices", "global:invoices");

                if (can_for_any_client('create', 'invoices')) {
                    Navigation::registerNavbarLink("admin/invoices/create", "global:createinvoice", "#invoices");
                }

                Navigation::registerNavbarLink("admin/invoices/all", "global:view_all", "#invoices");
                Navigation::setBadge("admin/invoices/all", get_count("all"));

                Navigation::registerNavbarLink("admin/invoices/paid", "global:paid", "#invoices");
                Navigation::setBadge("admin/invoices/paid", get_count("paid"));

                Navigation::registerNavbarLink("admin/invoices/all_unpaid", "global:unpaid", "#invoices");
                Navigation::setBadge("admin/invoices/all_unpaid", get_count("unpaid"));

                Navigation::registerNavbarLink("admin/invoices/overdue", "global:overdue", "#invoices");
                Navigation::setBadge("admin/invoices/overdue", get_count("overdue"));

                Navigation::registerNavbarLink("admin/invoices/unpaid", "global:sentbutunpaid", "#invoices");
                Navigation::setBadge("admin/invoices/unpaid", get_count("sent_but_unpaid"));

                Navigation::registerNavbarLink("admin/invoices/unsent", "global:unsent", "#invoices");
                Navigation::setBadge("admin/invoices/unsent", get_count("unsent"));

                Navigation::registerNavbarLink("admin/invoices/recurring", "global:recurring", "#invoices");
                Navigation::setBadge("admin/invoices/recurring", get_count("recurring"));

                Navigation::registerNavbarLink("admin/invoices/archived", "global:archived", "#invoices");
                Navigation::setBadge("admin/invoices/archived", get_count("invoices_archived"));


                if ($is_invoice_url and !$is_estimate_url) {
                    Navigation::setContainerClass("#invoices", "active");
                }

            }

            if (is_admin()) {
                Navigation::registerNavbarLink("admin/invoices/reminders", "reminders:reminders", "#invoices");
                Navigation::registerNavbarLink("admin/items", "global:reusableinvoiceitems", "#invoices");
            }

            if (can_for_any_client('read', 'estimates')) {
                Navigation::registerNavbarLink("#estimates", "global:estimates");

                if (can_for_any_client('create', 'estimates')) {
                    Navigation::registerNavbarLink("admin/estimates/create", "estimates:create", "#estimates");
                }

                Navigation::registerNavbarLink("admin/estimates/estimates", "global:view_all", "#estimates");
                Navigation::setBadge("admin/estimates/estimates", get_count("estimates"));

                Navigation::registerNavbarLink("admin/estimates/accepted", "global:accepted", "#estimates");
                Navigation::setBadge("admin/estimates/accepted", get_count("accepted"));

                Navigation::registerNavbarLink("admin/estimates/rejected", "global:rejected", "#estimates");
                Navigation::setBadge("admin/estimates/rejected", get_count("rejected"));

                Navigation::registerNavbarLink("admin/estimates/unanswered", "global:unanswered", "#estimates");
                Navigation::setBadge("admin/estimates/unanswered", get_count("unanswered"));

                Navigation::registerNavbarLink("admin/estimates/estimates_unsent", "global:estimates_unsent", "#estimates");
                Navigation::setBadge("admin/estimates/estimates_unsent", get_count("estimates_unsent"));

                Navigation::registerNavbarLink("admin/estimates/estimates_archived", "global:archived", "#estimates");
                Navigation::setBadge("admin/estimates/estimates_archived", get_count("estimates_archived"));


                if ($is_estimate_url) {
                    Navigation::setContainerClass("#estimates", "active");
                }
            }

            if (can_for_any_client('read', array('projects', 'project_tasks'))) {
                Navigation::registerNavbarLink("admin/projects", "global:projects");

                if (stripos($uri_string, "admin/projects") !== false) {
                    Navigation::setContainerClass("admin/projects", "active");
                }

            }

            if (can_for_any_client('read', 'project_expenses')) {
                $expenses_url = is_admin() ? "#expenses" : "admin/expenses";
                Navigation::registerNavbarLink($expenses_url, "expenses:expenses");

                if (is_admin()) {
                    Navigation::registerNavbarLink("admin/expenses", "global:view_all", $expenses_url);
                    Navigation::registerNavbarLink("admin/expenses/suppliers", "expenses:suppliers", $expenses_url);
                    Navigation::registerNavbarLink("admin/expenses/categories", "expenses:categories", $expenses_url);
                }

                if (stripos($uri_string, "admin/expenses") !== false) {
                    Navigation::setContainerClass($expenses_url, "active");
                }
            }

            if (can_for_any_client('read', 'proposals')) {
                Navigation::registerNavbarLink("#proposals", "global:proposals");

                Navigation::registerNavbarLink("admin/proposals/create", "proposals:createproposal", "#proposals");
                Navigation::setClass("admin/proposals/create", "fire-ajax");

                Navigation::registerNavbarLink("admin/proposals/all", "global:view_all", "#proposals");
                Navigation::setBadge("admin/proposals/all", get_count("proposals"));

                Navigation::registerNavbarLink("admin/proposals/accepted", "global:accepted", "#proposals");
                Navigation::setBadge("admin/proposals/accepted", get_count("proposals_accepted"));

                Navigation::registerNavbarLink("admin/proposals/rejected", "global:rejected", "#proposals");
                Navigation::setBadge("admin/proposals/rejected", get_count("proposals_rejected"));

                Navigation::registerNavbarLink("admin/proposals/unanswered", "global:unanswered", "#proposals");
                Navigation::setBadge("admin/proposals/unanswered", get_count("proposals_unanswered"));

                Navigation::registerNavbarLink("admin/proposals/archived", "global:archived", "#proposals");
                Navigation::setBadge("admin/proposals/archived", get_count("proposals_archived"));

                if (stripos($uri_string, "admin/proposals") !== false) {
                    Navigation::setContainerClass("#proposals", "active");
                }
            }

            if (can_for_any_client('read', 'tickets')) {
                Navigation::registerNavbarLink("admin/tickets", "global:tickets");
                if (stripos($uri_string, "admin/tickets") !== false) {
                    Navigation::setContainerClass("admin/tickets", "active");
                }
            }

            if (can_for_any_client('read', 'invoices')) {
                Navigation::registerNavbarLink("admin/reports", "global:reports");

                $businesses = $this->business_identities_m->getAllBusinessesDropdown(true);
                if (count($businesses) > 1) {
                    foreach ($businesses as $id => $business) {
                        if ($id > 0) {
                            $url = "admin/reports/all/business;$id";
                        } else {
                            $url = "admin/reports/all";
                        }

                        Navigation::registerNavbarLink($url, $business, "admin/reports");
                    }
                }

                if (stripos($uri_string, "admin/reports") !== false) {
                    Navigation::setContainerClass("admin/reports", "active");
                }
            }

            if (can_for_any_client('read', 'clients')) {
                Navigation::registerNavbarLink("admin/clients", "global:clients");
                if (stripos($uri_string, "admin/clients") !== false) {
                    Navigation::setContainerClass("admin/clients", "active");
                }
            }

            if (is_admin()) {
                Navigation::registerNavbarLink("admin/users", "global:users");
                if (stripos($uri_string, "admin/users") !== false) {
                    Navigation::setContainerClass("admin/users", "active");
                }
            }

            if (is_admin()) {
                Navigation::registerNavbarLink("#credit_notes", "global:credit_notes");
                Navigation::registerNavbarLink("admin/credit_notes/create", "credit_notes:create", "#credit_notes");


                Navigation::registerNavbarLink("admin/credit_notes/credit_notes", "global:view_all", "#credit_notes");
                Navigation::setBadge("admin/credit_notes/credit_notes", get_count("credit_notes"));

                Navigation::registerNavbarLink("admin/credit_notes/credit_notes_archived", "global:archived", "#credit_notes");
                Navigation::setBadge("admin/credit_notes/credit_notes_archived", get_count("credit_notes_archived"));

                if ($is_credit_notes_url) {
                    Navigation::setContainerClass("#credit_notes", "active");
                }
            }
        }
    }

    protected function setupQuickLinks() {

        Navigation::registerQuickLinkOwner("admin/projects");
        if (can_for_any_client("create", "projects")) {
            Navigation::registerQuickLink("admin/projects/create", "projects:add", "admin/projects", "fi-plus", "fire-ajax");
            Navigation::registerQuickLink("admin/projects/templates", "projects:createfromtemplate", "admin/projects", "fi-plus", "fire-ajax");

            $this->load->model("projects/project_template_m");
            if ($this->project_template_m->count_all() > 0) {
                Navigation::registerQuickLink("admin/projects/delete_templates", "projects:delete_project_template", "admin/projects", "fi-trash", "fire-ajax");
            }

        }

        Navigation::registerQuickLink("admin/projects/archived", "projects:archive", "admin/projects", "fi-archive");

        Navigation::registerQuickLinkOwner("admin/clients");
        if (is_admin()) {
            Navigation::registerQuickLink("admin/clients/create/", "clients:add", "admin/clients", "fi-plus");
        }

        Navigation::registerQuickLinkOwner("admin/projects/view", function ($data) {
            $id = $data["id"];
            $client_id = $data["client_id"];
            $has_tasks = $data["has_tasks"];
            $is_archived = $data["is_archived"];

            if (is_admin()) {
                Navigation::registerQuickLink("admin/projects/milestones/create/$id", "milestones:add", "admin/projects/view", "fi-plus", "fire-ajax");
            }

            if (can('create', $client_id, 'project_tasks')) {
                Navigation::registerQuickLink("admin/projects/tasks/create/$id", "tasks:create", "admin/projects/view", "fi-checkbox", "fire-ajax");
            }

            Navigation::registerQuickLink("admin/projects/times/create/$id", "projects:add_time", "admin/projects/view", "fi-clock", "fire-ajax");

            if (can('generate_from_project', $client_id, 'projects', $id)) {
                Navigation::registerQuickLink("admin/invoices/create/$id", "projects:generate_invoice", "admin/projects/view", "fi-page-add");
                Navigation::registerQuickLink("admin/invoices/create/$id/$client_id/estimate", "estimates:generate_estimate", "admin/projects/view", "fi-page-add");
            }

            if (can('create', $client_id, 'project_expenses')) {
                Navigation::registerQuickLink("admin/projects/add_expense/$id", "items:add_expense_to_project", "admin/projects/view", "fi-pricetag-multiple", "fire-ajax");
            }

            Navigation::registerQuickLink("admin/projects/times/view_entries/project/$id", "timesheet:view_pdf", "admin/projects/view", "fi-paperclip");

            Navigation::registerQuickLink("admin/discussions/project/$id", "discussions:discussion_area", "admin/projects/view", "fi-comments");

            if (can('update', $client_id, 'projects', $id)) {
                if ($is_archived) {
                    Navigation::registerQuickLink("admin/projects/unarchive/$id", "projects:unarchive_proj", "admin/projects/view", "fi-archive");
                } else {
                    Navigation::registerQuickLink("admin/projects/archive/$id", "projects:archive_proj", "admin/projects/view", "fi-archive");
                }

                Navigation::registerQuickLink("admin/projects/templatize/$id", "projects:templatize", "admin/projects/view", "fi-folder-add", "fire-ajax");
                Navigation::registerQuickLink("admin/projects/edit/$id", "projects:edit", "admin/projects/view", "fi-pencil", "fire-ajax");
            }

            if (can('delete', $client_id, 'projects', $id)) {
                Navigation::registerQuickLink("admin/projects/delete/$id", "projects:delete", "admin/projects/view", "fi-trash", "fire-ajax");
            }
        });

        Navigation::registerQuickLinkOwner("admin/proposals/view", function ($data) {
            $root = "admin/proposals/view";
            $id = $data["id"];
            $unique_id = $data["unique_id"];
            $client_id = $data["client_id"];
            $is_archived = $data["is_archived"];
            $is_sent = $data["is_sent"];

            Navigation::registerQuickLink("proposal/$unique_id/pdf", "global:viewpdf", $root, "fa fa-file-pdf-o");

            Navigation::registerQuickLink("admin/discussions/proposal/$id", "discussions:discussion_area", $root, "fi-comments");

            if (!$is_sent) {
                Navigation::registerQuickLink("#mark-as-sent", "invoices:markassent", $root, "fa fa-paper-plane", "mark-as-sent");
            }

            if ($is_archived) {
                Navigation::registerQuickLink("admin/proposals/restore/$unique_id", "global:restore", $root, "fi-archive");
            } else {
                Navigation::registerQuickLink("admin/proposals/archive/$unique_id", "global:archive", $root, "fi-archive");
            }

            if (can('create', $client_id, "proposals", $id)) {
                Navigation::registerQuickLink("admin/proposals/duplicate/$unique_id", "global:duplicate", $root, "fi-page-copy");
            }

            if (can('update', $client_id, "proposals", $id)) {
                Navigation::registerQuickLink("admin/proposals/edit/$unique_id", "global:edit", $root, "fi-pencil");
            }

            if (can('delete', $client_id, "proposals", $id)) {
                Navigation::registerQuickLink("admin/proposals/delete/$unique_id", "global:delete", $root, "fi-trash");
            }
        });

        Navigation::registerQuickLinkOwner("admin/invoices/view", function ($data) {
            $root = "admin/invoices/view";
            $id = $data["id"];
            $unique_id = $data["unique_id"];
            $client_id = $data["client_id"];
            $module = $data["module"];
            $is_archived = $data["is_archived"];
            $is_paid = $data["is_paid"];
            $is_sent = $data["is_sent"];
            $project_id = $data["project_id"];
            $has_auto_charge = $data["has_auto_charge"];
            $has_multiple_parts = $data["has_multiple_parts"];
            $can_edit = can('update', $client_id, "invoices", $id);

            Navigation::registerQuickLink("pdf/$unique_id", "global:viewpdf", $root, "fa fa-file-pdf-o");

            Navigation::registerQuickLink("admin/discussions/invoice/$id", "discussions:discussion_area", $root, "fi-comments");

            if ($module == "invoices") {
                if ($can_edit && !$is_paid) {
                    Navigation::registerQuickLink("#add-payment", "partial:add_payment", $root, "fi-dollar-bill", "add_payment");
                }

                if (!$has_multiple_parts) {
                    $label = $is_paid ? "partial:paymentdetails" : "partial:markaspaid";
                    Navigation::registerQuickLink("#mark-as-paid", $label, $root, "fi-dollar-bill", "partial-payment-details");
                }

                if (!$is_paid && $has_auto_charge && $can_edit) {
                    Navigation::registerQuickLink("admin/invoices/auto_charge/$unique_id", "invoices:auto_charge", $root, "fi-credit-card", "fire-ajax");
                }
            }

            if (!$is_sent) {
                Navigation::registerQuickLink("#mark-as-sent", "invoices:markassent", $root, "fa fa-paper-plane", "mark-as-sent");
            }

            if ($is_archived) {
                Navigation::registerQuickLink("admin/$module/restore/$unique_id", "global:restore", $root, "fi-archive");
            } else {
                Navigation::registerQuickLink("admin/$module/archive/$unique_id", "global:archive", $root, "fi-archive");
            }

            if (can('create', $client_id, "invoices", $id)) {
                Navigation::registerQuickLink("admin/$module/duplicate/$unique_id", "global:duplicate", $root, "fi-page-copy");
            }

            if ($module == "estimates") {
                if ($project_id) {
                    $project = $this->project_m->get_by(["id" => $project_id]);
                    if (isset($project->id)) {
                        $project_name = $this->project_m->get_dropdown_per_client($client_id, $project_id);
                        $label = __('global:appendtoproject', [$project_name]);
                    } else {
                        $label = "global:converttoproject";
                    }
                } else {
                    $label = "global:converttoproject";
                }

                Navigation::registerQuickLink("admin/$module/convert/$unique_id", $label, $root, "fi-page-copy");
            }

            if ($module == "invoices" || $module == "estimates") {
                $label = ($module == "invoices") ? "global:converttoestimate" : "global:converttoinvoice";
                Navigation::registerQuickLink("admin/$module/convert_to_invoice/$unique_id", $label, $root, "fi-page-copy");
            }

            if ($can_edit) {
                Navigation::registerQuickLink("admin/$module/edit/$unique_id", "global:edit", $root, "fi-pencil");
            }

            if (can('delete', $client_id, "invoices", $id)) {
                Navigation::registerQuickLink("admin/$module/delete/$unique_id", "global:delete", $root, "fi-trash");
            }

        });

        Navigation::registerQuickLinkOwner("admin/discussions", function ($data) {
            $item_id = $data["item_id"];
            $item_type = $data["item_type"];

            if ($item_type == "project") {
                Navigation::registerQuickLink("admin/projects/view/$item_id", "projects:back_to_project", "admin/discussions", "fa fa-chevron-left");
            } elseif ($item_type == "task") {
                $project_id = $this->project_task_m->getProjectIdById($item_id);
                Navigation::registerQuickLink("admin/projects/view/$project_id", "projects:back_to_project", "admin/discussions", "fa fa-chevron-left");
            }
        });

        Navigation::registerQuickLinkOwner("admin/clients/view", function ($data) {
            $id = $data["id"];
            $unique_id = $data["unique_id"];

            Navigation::registerQuickLink(Settings::get('kitchen_route') . "/$unique_id", "global:client_area", "admin/clients/view", "fi-home");

            Navigation::registerQuickLink("admin/discussions/client/$id", "discussions:discussion_area", "admin/clients/view", "fi-comments");

            if (can('create', $id, 'projects')) {
                Navigation::registerQuickLink("admin/projects/index/0/$id#create", "projects:add", "admin/clients/view", "fi-plus");
            }

            if (can('create', $id, 'invoices')) {
                Navigation::registerQuickLink("admin/invoices/create/client/$id", "invoices:create", "admin/clients/view", "fi-page-add");
            }

            if (can('create', $id, 'estimates')) {
                Navigation::registerQuickLink("admin/estimates/create/client/$id", "estimates:create", "admin/clients/view", "fi-page-add");
            }

            if (is_admin()) {
                Navigation::registerQuickLink("admin/credit_notes/create/client/$id", "credit_notes:create", "admin/clients/view", "fi-page-add");
            }

            if (is_admin()) {
                Navigation::registerQuickLink("admin/invoices/make_bulk_payment/$id", "invoices:make_bulk_payment", "admin/clients/view", "fi-pricetag-multiple");
            }

            if (can('update', $id, 'clients', $id)) {
                Navigation::registerQuickLink("admin/clients/edit/$id", "clients:edit", "admin/clients/view", "fi-pencil");
                Navigation::registerQuickLink("admin/clients/send_client_area_email/$id", "clients:send_client_area_email", "admin/clients/view", "fi-mail");
            }

            if (can('delete', $id, 'clients', $id)) {
                Navigation::registerQuickLink("admin/clients/delete/$id", "clients:delete", "admin/clients/view", "fi-trash");
            }
        });

        Navigation::registerQuickLinkOwner("admin/emails");
        Navigation::registerQuickLink("admin/emails/create", "emailtemplates:create_template", "admin/emails", "fi-plus");
        Navigation::registerQuickLink("admin/invoices/reminders", "reminders:reminders", "admin/emails", "fi-link");

        Navigation::registerQuickLinkOwner("admin/invoices");
        if (can_for_any_client('create', 'invoices')) {
            Navigation::registerQuickLinkOwner("admin/invoices", function () {
                $segments = $this->uri->segment_array();

                switch ($segments[2]) {
                    case "credit_notes":
                        $module = "credit_notes";
                        break;
                    case "estimates":
                        $module = "estimates";
                        break;
                    default:
                        switch ($segments[3]) {
                            case "credit_notes":
                                $module = "credit_notes";
                                break;
                            case "estimates":
                                $module = "estimates";
                                break;
                            default:
                                $module = "invoices";
                                break;
                        }
                        break;
                }

                Navigation::registerQuickLink("admin/$module/create", "$module:create", "admin/invoices", "fi-plus");
            });
        }

        Navigation::registerQuickLinkOwner("admin/users");
        Navigation::registerQuickLink("admin/users/create", "users:create_user", "admin/users", "fi-plus", "fire-ajax");

        Navigation::registerQuickLinkOwner("admin/proposals");
        Navigation::registerQuickLink("admin/proposals/create", "proposals:createproposal", "admin/proposals", "fi-plus", "fire-ajax");

        Navigation::registerQuickLinkOwner("admin/invoices/make_bulk_payment", function ($data) {
            $client_id = $data["client_id"];

            Navigation::registerQuickLink("admin/clients/view/$client_id", "clients:view", "admin/invoices/make_bulk_payment", "fi-eye");
        });

        Navigation::registerQuickLinkOwner("admin/invoices/reminders");
        Navigation::registerQuickLink("admin/emails/create", "emailtemplates:create_template", "admin/invoices/reminders", "fi-plus");
        Navigation::registerQuickLink("admin/emails/all", "emailtemplates:manage", "admin/invoices/reminders", "fi-pencil");

        Navigation::registerQuickLinkOwner("admin/invoices/estimates");
        if (can_for_any_client('create', 'estimates')) {
            Navigation::registerQuickLink("admin/estimates/create", "estimates:create", "admin/invoices/estimates", "fi-plus");
        }

        Navigation::registerQuickLinkOwner("admin/invoices/credit_notes");
        if (is_admin()) {
            Navigation::registerQuickLink("admin/credit_notes/create", "credit_notes:create", "admin/invoices/credit_notes", "fi-plus");
        }

        Navigation::registerQuickLinkOwner("admin/invoices/created", function ($data) {
            $unique_id = $data["unique_id"];
            $invoice = get_instance()->invoice_m->get($unique_id);
            $module = human_invoice_type($invoice['type']);

            Navigation::registerQuickLink("admin/$module/edit/$unique_id", "$module:edit", "admin/invoices/created", "fi-pencil");
            Navigation::registerQuickLink($unique_id, "$module:preview", "admin/invoices/created", "fi-eye");
        });

    }

    public function _guess_title($module_override = null) {
        $this->load->helper('inflector');
        $method = $this->router->fetch_method();
        $module = $module_override ? $module_override : $this->router->fetch_module();

        // Obviously no title, lets get making one
        $title_parts = array();

        // If the method is something other than index, use that
        if ($method != 'index' and $method != 'all') {
            $title_parts[] = $method;
        }

        // Is there a module? Make sure it is not named the same as the method or controller
        if (!empty($module) AND !in_array($module, $title_parts)) {

            if ($module == "invoices") {
                $parts = explode("/", $this->uri->uri_string());
                $module = $parts[1];
            }

            $title_parts[] = $module;
        }

        $title_parts = array_reverse($title_parts);

        // Glue the title pieces together using the title separator setting
        $title = humanize(implode(' &raquo; ', $title_parts)) . " | " . Business::getBrandName();

        return $title;
    }

    protected function _json($array_or_error = [], $is_success = true) {
        $this->output->enable_profiler(false);
        $this->output->set_content_type("application/json");
        $flags = JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION;
        if (IS_DEBUGGING) {
            $flags = $flags | JSON_PRETTY_PRINT;
        }
        $json = [
            "success" => $is_success,
        ];

        if (!$is_success) {
            $json["error"] = $array_or_error;
        } else {
            $json = array_merge($array_or_error, $json);
        }

        $this->output->append_output(json_encode($json, $flags));
    }

    /**
     * Dispatch any possible events and return the value.
     */
    public function dispatch_return($event, $value, $return_type = 'string') {
        return Events::has_listeners($event) ? Events::trigger($event, $value, $return_type) : $value;
    }
}

/* End of file: Pancake_Controller.php */