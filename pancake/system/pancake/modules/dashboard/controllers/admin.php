<?php

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
 * The admin controller for the dashboard
 *
 * @subpackage    Controllers
 * @category      Dashboard
 */
class Admin extends Admin_Controller {

    function __construct() {
        parent::__construct();
        $this->load->model('invoices/invoice_m');
        $this->load->model('proposals/proposals_m');
        $this->load->model('projects/project_m');
        $this->load->model('projects/project_task_m');
        $this->load->model('projects/project_expense_m');
        $this->load->model('projects/project_time_m');
        $this->load->model('clients/clients_m');
        $this->load->model('kitchen/kitchen_comment_m');
        $this->load->helper('array');
    }

    function backend_css() {
        $this->output->enable_profiler(false);
        header("Content-Type: text/css; charset=utf-8");
        echo backend_css();
    }

    function setup_js() {
        $this->output->enable_profiler(false);
        header("Content-Type: application/javascript; charset=utf-8");
        echo get_setup_js();
    }

    function backend_js() {
        $this->output->enable_profiler(false);
        header("Content-Type: application/javascript; charset=utf-8");
        echo backend_js();
    }

    /**
     * Outputs a nice dashboard for the user
     *
     * @access    public
     * @return    void
     */
    public function index() {
        $this->benchmark->mark("controller_setup_start");
        $dashboard_items = 6;

        $this->template->expenses_sum = $this->project_expense_m->get_all_expenses_sum(Settings::fiscal_year_start()->timestamp);
        $this->load->model("invoices/partial_payments_m", "ppm");

        $this->db->join("invoices", "invoices.unique_id = unique_invoice_id");
        $this->db->where("type", "DETAILED");
        $this->db->where("payment_method !=", "credit-balance");
        $this->db->where("partial_payments.is_paid", 1);
        $this->db->where("partial_payments.payment_date >=", Settings::fiscal_year_start()->timestamp);
        $this->db->select("unique_invoice_id, partial_payments.unique_id");
        $this->db->distinct();
        $results = $this->db->get("partial_payments")->result_array();

        $unique_ids_of_invoices_paid_this_fiscal_year = array_map(function ($row) {
            return $row['unique_invoice_id'];
        }, $results);
        $unique_payment_ids_of_invoices_paid_this_fiscal_year = array_map(function ($row) {
            return $row['unique_id'];
        }, $results);

        # Paid is separate from unpaid because Paid can only be since the start of the fiscal year.
        $totals = $this->ppm->get_totals($unique_ids_of_invoices_paid_this_fiscal_year, $unique_payment_ids_of_invoices_paid_this_fiscal_year);
        $this->template->paid = $totals['paid_totals']['total'];

        $this->db->join("invoices", "invoices.unique_id = unique_invoice_id");
        $this->db->where("type", "DETAILED");
        $this->db->where("is_archived", "0");
        $this->db->where("partial_payments.is_paid", 0);
        $this->db->select("unique_invoice_id, invoices.due_date, invoices.date_entered, invoices.id");
        $this->db->order_by('invoices.due_date', 'DESC');
        $this->db->order_by('invoices.date_entered', 'DESC');
        $this->db->order_by('invoices.id', 'DESC');
        $this->db->distinct();
        $unique_ids_of_all_invoices_unpaid = array_map(function ($row) {
            return $row['unique_invoice_id'];
        }, $this->db->get("partial_payments")->result_array());
        $totals = $this->ppm->get_totals($unique_ids_of_all_invoices_unpaid);

        $this->template->unpaid = $totals['unpaid_totals']['total'];
        $this->template->overdue = $totals['overdue_totals']['total'];
        $this->template->outstanding = $totals['outstanding_totals']['total'];

        $has_rounding = (process_hours(Settings::get('task_time_interval')) > 0);
        $hours_worked = $this->project_time_m->get_all_hours_worked(Settings::fiscal_year_start()->timestamp);
        $this->template->hours_worked = format_hours($hours_worked["hours"]);
        $this->template->rounded_hours_worked = format_hours($hours_worked["rounded_hours"]);
        $this->template->has_rounding = $has_rounding;
        $this->template->active_timers = $this->project_time_m->active_timer_count();
        $this->template->project_count = $this->project_m->count_all_projects();
        $this->template->client_count = $this->clients_m->count_all();
        // sous models

        $this->template->upcoming_invoices = $this->invoice_m->flexible_get_all([
            'paid' => false,
            'sent' => true,
            'include_totals' => true,
            'archived' => false,
            'offset' => 0,
            'per_page' => $dashboard_items,
            'order' => [
                'due_date' => 'ASC', # Show oldest unpaid invoices first.
            ],
        ]);
        $this->template->team_working_on = $this->project_task_m->get_team_status($this->current_user->id, $dashboard_items);
        $this->template->my_upcoming_tasks = $this->project_task_m->upcoming_tasks_for_user($this->current_user->id, $dashboard_items);

        $this->template->projects = $this->project_m->get_for_dashboard();
        $this->template->comments = $this->kitchen_comment_m->get_for_dashboard();
        $this->benchmark->mark("controller_setup_end");

        $this->template->build('dashboard');
    }

    function all_comments() {
        $this->template->comments = $this->kitchen_comment_m->get_for_dashboard(PHP_INT_MAX);
        $this->template->view_all = false;
        $this->template->build('all_comments');
    }

    function all_client_activity()
    {
        $this->template->client_activity_x = PHP_INT_MAX;
        $this->template->client_activity_since = now()->subMonths(3);
        $this->template->view_all = false;
        $this->template->build('all_client_activity');
    }

    function all_team_activity() {
        $this->template->team_working_on = $this->project_task_m->get_team_status($this->current_user->id, PHP_INT_MAX);
        $this->template->view_all = false;
        $this->template->build('all_team_activity');
    }

}

/* End of file: admin.php */