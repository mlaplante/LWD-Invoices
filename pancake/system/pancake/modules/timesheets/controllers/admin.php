<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright	Copyright (c) 2010, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 4.2.3
 */
// ------------------------------------------------------------------------

/**
 * The admin controller for the timesheets module
 *
 * @subpackage	Controllers
 * @category	Dashboard
 */
class Admin extends Admin_Controller {
    
    function __construct() {
        parent::__construct();
        $this->load->model('invoices/invoice_m');
        $this->load->model('timesheets/timesheet_m');
        $this->load->model('proposals/proposals_m');
        $this->load->model('projects/project_m');
        $this->load->model('projects/project_task_m');
        $this->load->model('projects/project_expense_m');
        $this->load->model('projects/project_time_m');
        $this->load->model('clients/clients_m');
        $this->load->model('kitchen/kitchen_comment_m');
        $this->load->helper('array');
    }

    /**
     * Outputs a nice dashboard for the user
     *
     * @access	public
     * @return	void
     */
    public function index() {

        $start_time = date('Y-m-d');


        return $this->filter(null, $start_time);
      
    }

    public function rehash()
    {

        if (isset($_POST['startDate']) && !empty($_POST['startDate'])) {
            $start_date = carbon($_POST['startDate']);
        } else {
            $start_date = now();
        }

        if (isset($_POST['endDate']) && !empty($_POST['endDate'])) {
            $end_date = carbon($_POST['endDate']);
        } else {
            $end_date = now();
        }

        $start_date = $start_date->toDateString();
        $end_date = $end_date->toDateString();
        
        if (isset($_POST['user_id']) and !empty($_POST['user_id']) and $_POST['user_id'] != 'all') {
            $user_id = $this->input->post('user_id');
        } else {
            $user_id = 'all';
        }

        redirect("/admin/timesheets/filter/$user_id/$start_date/$end_date");
    }

    public function filter($user=null,$start=null, $end=null)
    {

        if($user == 'all')
        {
            $user = null;
        }

        if(!is_admin())
        {
            $user = $this->current_user->id;
        }

        if(! isset($start))
        {
            $start = now()->toDateString();
        }

        if(! isset($end))
        {
            $end = null;
        }

        $timeEntries = $this->timesheet_m->build_timesheet($user,$start,$end);


        $userEntries = array();
        foreach($timeEntries as $entry)
        {
            if(!isset($userEntries[$entry->user_id]))
            {   
                $userEntries[$entry->user_id] = array(
                    'user' => $entry->first_name.' '.$entry->last_name,
                    'totalHours' => 0,
                    'billableHours' => 0,
                    'entries' => array(),
                    'projectHours' => array()
                );
            }
            $userEntries[$entry->user_id]['entries'][] = $entry;
            $userEntries[$entry->user_id]['totalHours'] += $entry->minutes/60;
            $userEntries[$entry->user_id]['billableHours'] += $entry->rounded_minutes/60;

            if(!isset($userEntries[$entry->user_id]['projectHours'][$entry->project_id]))
            {
                $userEntries[$entry->user_id]['projectHours'][$entry->project_id] = array(
                    'name' => $entry->project_name,
                    'company' => $entry->company,
                    'hours' => 0,
                    'billableTime' => 0,
                );
            }
            $userEntries[$entry->user_id]['projectHours'][$entry->project_id]['hours'] += $entry->minutes/60;
            $userEntries[$entry->user_id]['projectHours'][$entry->project_id]['billableTime'] += $entry->rounded_minutes/60;
        }


        if (isset($end)) {
            $dateRange = format_date(carbon($start)) . ' to ' . format_date(carbon($end));
        } else {
            if (!carbon($start)->isToday()) {
                $dateRange = $start;
            } else {
                $dateRange = __('timesheets:todays');
            }
        }

        $users = $this->ion_auth->get_users();
        $users_select = array('all' => __('timesheets:all_users'));
        foreach ($users as $user) {
            $users_select[$user->id] = $user->first_name . ' ' . $user->last_name . ' (' . $user->username . ')';
        }

        $this->template->users = $users_select;
        $this->template->dateRange = $dateRange;
        $this->template->original_start = $start;
        $this->template->original_end = $end;
        $this->template->start = format_date(carbon($start));
        $this->template->end = format_date($end ? carbon($end) : now());
        $this->template->userEntries = $userEntries;

        $this->template->build('dashboard');
       
    }
    
  

}

/* End of file: admin.php */