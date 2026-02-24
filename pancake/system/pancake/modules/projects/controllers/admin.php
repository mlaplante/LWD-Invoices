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
 * @since          Version 1.1
 */
// ------------------------------------------------------------------------

/**
 * The admin controller for projects
 *
 * @subpackage    Controllers
 * @category      Projects
 */
class Admin extends Admin_Controller {

    /**
     * Load in the dependencies
     *
     * @access    public
     * @return    void
     */
    public function __construct() {
        parent::__construct();
        $this->load->model(array(
            'project_m', 'project_task_m', 'project_time_m',
            'project_milestone_m', 'project_expense_m', 'project_template_m', 'clients/clients_m'));
    }

    // --------------------------------------------------------------------

    private function _get_context($offset, $client = null, $archived = false) {
        $data = array('client_id' => $client);
        if (!$archived) {
            $data['projects'] = $this->project_m->get_unarchived_projects($this->pagination_config['per_page'], $offset, $client);
        } else {
            $data['projects'] = $this->project_m->get_archived_projects($this->pagination_config['per_page'], $offset, $client);
        }

        $data['archived_count'] = $this->project_m->archived_project_count();
        $data['unarchived_count'] = $this->project_m->unarchived_project_count();

        $this->template->client_id = $client;

        // Start up the pagination
        $this->load->library('pagination');
        $this->pagination_config['base_url'] = $archived ? site_url('admin/projects/archived') : site_url('admin/projects/index');
        $this->pagination_config['uri_segment'] = 4;
        $this->pagination_config['total_rows'] = $archived ? $data['archived_count'] : $data['unarchived_count'];
        $this->pagination->initialize($this->pagination_config);

        $data = $this->dispatch_return('process_projects_list', $data, 'array');

        # Altered by a plugin.
        if (!isset($data['projects'])) {
            $data = reset($data);
        }

        return $data;
    }

    function delete_templates() {
        $id = isset($_POST['id']) ? $_POST['id'] : null;

        if ($id === null) {
            if (!IS_AJAX) {
                redirect("admin/projects");
            }

            $this->load->view("projects/templates/delete", array(
                "templates" => $this->project_template_m->get_dropdown(),
            ));
        } else {
            $this->project_template_m->delete($id);
            $this->session->set_flashdata('success', __('projects:deleted_template'));
            redirect("admin/projects");
        }
    }

    function fix_sub_sub_child_tasks() {
        $this->project_task_m->fix_sub_sub_child_tasks();
        echo "OK";
    }

    /**
     * Lists all the projects
     *
     * @access    public
     *
     * @param    int        The offset to start at
     *
     * @return    void
     */
    public function index($offset = 0, $client = null) {
        $data = $this->_get_context($offset, $client);
        $data["template_count"] = $this->project_template_m->count_all();

        if ($client) {
            $this->template->client = $this->clients_m->get($client);
        }

        $this->template->build('index', $data);
    }

    public function archived($offset = 0, $client = 0) {
        $data = $this->_get_context($offset, $client, true);
        $this->template->build('archived', $data);
    }

    // TODO v4
    // MOVE ALL THIS TEMPLATE LOGIC TO IT'S OWN CONTROLLER
    public function templatize($project_id) {

        is_admin() or access_denied();

        $project = $this->project_m->get_project_by_id($project_id)->row();
        if (!$project)
            show_404();

        if ($_POST) {
            // create new project template
            $this->project_template_m->create_from_project($project);

            // redirect to /project or /project/templates
            $this->session->set_flashdata('success', __('projects:createdtemplate'));
            redirect('admin/projects');
        }

        $this->load->view('templates/templatize', array('project' => $project));
    }

    public function templates() {
        // load list views that shows all project templates
        $templates = $this->project_template_m->get_all();

        $clients_dropdown = client_dropdown('projects', 'create_plus_update');

        $this->load->view('templates/index', array('templates' => $templates, 'clients' => $clients_dropdown));
    }

    public function template($template_id) {
        // load view for tempate
        // load tasks for tempate
    }

    public function create_from_template() {
        // require post
        if (!$_POST) {
            $this->session->set_flashdata('error', __("projects:no_data_provided"));
            redirect("admin/projects");
        }

        can('create', $this->input->post('client_id'), 'projects') or access_denied();

        // create new project that is a duplicate
        $template = $this->project_template_m->get($this->input->post('template_id'));
        if (!$template) {
            $this->session->set_flashdata('error', __("projects:invalid_template"));
            redirect("admin/projects");
        }

        $id = $this->project_m->create_from_template($template, $this->input->post('project_name'), $this->input->post('client_id'));

        $this->session->set_flashdata('success', $this->lang->line('projects.create.succeeded'));
        redirect('admin/projects/view/' . $id);
    }

    // --------------------------------------------------------------------

    /**
     * View details of a project
     *
     * @access    public
     * @return    void
     */
    public function view($project_id = 0, $offset = 0) {

        if ($project_id == 0) {
            redirect("admin/projects");
        }

        can('read', $this->project_m->getClientIdById($project_id), 'projects', $project_id) or access_denied();

        $totals = $this->project_m->getTotalsForProject($project_id, true);

        $this->load->helper('typography');

        $project = $this->project_m->get_project_by_id($project_id);

        if (!$project) {
            $this->session->set_flashdata('error', __('projects:doesnotexist'));
            redirect('admin/projects');
        } else {
            $project = $project->row();
        }
        $this->template->completion_percent = $this->project_m->get_completion_percent($project);
        $this->load->model('project_task_statuses_m');
        $this->template->task_status_types = $this->project_task_statuses_m->get_all();

        // Start up the pagination
        $this->load->library('pagination');

        $this->load->model('invoices/invoice_m');
        $linked_invoices = $this->invoice_m->get_linked_invoices($project_id);
        $linked_estimates = $this->invoice_m->get_linked_estimates($project_id);

        $this->pagination_config['base_url'] = site_url('admin/projects/view/' . $project_id . '/');
        $this->pagination_config['uri_segment'] = 5;
        $this->pagination_config['total_rows'] = $this->project_task_m->count_all_tasks($project_id);
        $this->pagination->initialize($this->pagination_config);

        $users = $this->ion_auth->get_users();
        $users_select = array('' => __('milestones:select_assignee_default'));
        foreach ($users as $user) {
            $users_select[$user->id] = $user->first_name . ' ' . $user->last_name . ' (' . $user->username . ')';
        }

        //$milestones = $this->project_milestone_m->get_milestones_by_project($project_id);
        $milestones = $this->project_milestone_m->order_by('order', 'asc')->get_many_by(array('project_id' => $project_id));
        foreach ($milestones as $mkey => $milestone) {
            $tasks = $this->project_task_m->get_tasks_and_times_by_project($project_id, 500, 0, true, $milestone->id);

            foreach ($tasks as $key => $task) {
                $subtasks = $this->project_task_m->get_tasks_and_times_by_project($project->id, 500, 0, true, null, $task['id']);
                $tasks[$key]['subtasks'] = $subtasks ? $subtasks : array();
            }

            $tasks_buffer = $this->project_task_m->where('project_id', $project_id)->order_by('name')->get_all();
            $tasks_select = array('' => '-- Not related to a task --');
            foreach ($tasks_buffer as $task) {
                $tasks_select[$task->id] = $task->name;
            }

            $milestones[$mkey]->tasks = $tasks;
        }

        $milestones_select = array(__('milestones:select_default'));
        foreach ($milestones as $milestone) {
            $milestones_select[$milestone->id] = $milestone->name;
        }

        //$tasks = $this->project_task_m->get_tasks_and_times_by_project($project_id, $this->pagination_config['per_page'], $offset);
        $tasks = $this->project_task_m->get_tasks_and_times_by_project($project_id, 500, 0, true, 0);

        foreach ($tasks as $key => $task) {
            $subtasks = $this->project_task_m->get_tasks_and_times_by_project($project->id, 500, 0, true, null, $task['id']);
            $tasks[$key]['subtasks'] = $subtasks ? $subtasks : array();
        }

        $tasks_buffer = $this->project_task_m->where('project_id', $project_id)->order_by('name')->get_all();
        $tasks_select = array('' => '-- Not related to a task --');
        foreach ($tasks_buffer as $task) {
            $tasks_select[$task->id] = $task->name;
        }

        /*

          Calulate the percentage to use for project completion.
          Set min and max ranges to accurately reset the chart.
          Set color based on current status.


         */

        if ($totals['hours'] != 0 && $project->projected_hours != 0) {

            $project->budget_percentage = number_format(((time_to_decimal($totals['hours']) / $project->projected_hours) * 100), 0);


            if ($project->budget_percentage < 80 or $project->budget_percentage == 100) {
                $project->budget_percentage_min = 0;
                $project->budget_percentage_max = 100;
                $project->budget_status_color = '#87ceeb';
                $project->budget_status_bgcolor = '';
            } elseif ($project->budget_percentage >= 80 && $project->budget_percentage < 100) {
                $project->budget_percentage_min = 0;
                $project->budget_percentage_max = 100;
                $project->budget_status_color = '#fb9e60';
                $project->budget_status_bgcolor = '';
            } elseif ($project->budget_percentage >= 100 && $project->budget_percentage < 200) {
                $project->budget_percentage_min = 100;
                $project->budget_percentage_max = 200;
                $project->budget_status_color = '#cd5c5c';
                $project->budget_status_bgcolor = '#fb9e60';
            } elseif ($project->budget_percentage >= 200 && $project->budget_percentage < 2000) {
                $project->budget_percentage_min = 200;
                $project->budget_percentage_max = 2000;
                $project->budget_status_color = '#000000';
                $project->budget_status_bgcolor = '#cd5c5c';
            }
        } else {
            $project->budget_percentage = '0';
            $project->budget_percentage_min = 0;
            $project->budget_percentage_max = 0;
            $project->budget_status_color = null;
            $project->budget_status_bgcolor = null;
        }

        $extra_project_sidebar_info = $this->dispatch_return('generate_extra_project_sidebar_info', array(
            'client' => $this->clients_m->getById($project->client_id),
            'project' => $project,
        ));

        if (is_array($extra_project_sidebar_info)) {
            $extra_project_sidebar_info = "";
        }

        $invoiced_amount = 0;
        foreach ($linked_invoices as $invoice) {
            $invoiced_amount += Currency::convert($invoice->total, $invoice->currency_code, $project->currency_code);
        }

        $this->template->build('view', array(
            'project' => $project,
            'extra_project_sidebar_info' => $extra_project_sidebar_info,
            'tasks' => $tasks,
            'users_select' => $users_select,
            'milestones_select' => $milestones_select,
            'milestones' => $milestones,
            'totals' => $totals,
            'invoiced_amount' => $invoiced_amount,
            'tasks_select' => $tasks_select,
            'linked_invoices' => $linked_invoices,
            'linked_estimates' => $linked_estimates,
            'project_expenses' => $this->project_expense_m->get_sum_by_project($project_id),
        ));
    }

    // --------------------------------------------------------------------

    /**
     * Creates a new project
     *
     * @access    public
     * @return    void
     */
    public function create() {
        (IS_AJAX) or access_denied();

        if ($_POST) {

            can('create', $_POST['client_id'], 'projects') or access_denied();

            // All form validation is handled in the model, so lets just throw it the data
            if ($result = $this->project_m->insert($_POST)) {
                $message = array('success' => $this->lang->line('projects.create.succeeded'));
            } else {
                if ($errors = validation_errors('<p>', '</p>')) {
                    $message = array('error' => $errors);
                } else {
                    $message = array('error' => $this->lang->line('projects.create.failed'));
                }
            }

            output_json($message);
        }

        $base_currency = Currency::get();
        $currencies = array('[Default] ' . $base_currency['name']);
        foreach (Settings::all_currencies() as $currency) {
            $currencies[$currency['code']] = $currency['name'];
        }

        $this->load->model('clients/clients_m');

        $this->load->view('form', array(
            'clients_dropdown' => client_dropdown('projects', 'create_plus_update'),
            'action' => 'create',
            'currencies' => $currencies,
        ));
    }

    // --------------------------------------------------------------------

    /**
     * Edit a new project
     *
     * @access    public
     * @return    void
     */
    public function edit($project_id = null) {
        if ($project_id === null) {
            if (isset($_REQUEST['id'])) {
                $project_id = $_REQUEST['id'];
            }
        }

        (IS_AJAX and can('update', $this->project_m->getClientIdById($project_id), 'projects', $project_id)) or access_denied();

        $project = $this->project_m->get_project_by_id($project_id);

        if ($_POST) {
            // All form validation is handled in the model, so lets just throw it the data
            if ($result = $this->project_m->update($project_id, $_POST)) {
                $this->session->set_flashdata('success', __('projects.update.succeeded'));
                $message = array('success' => $this->lang->line('projects.update.succeeded'));
            } else {
                if ($errors = validation_errors('<p>', '</p>')) {
                    $message = array('error' => $errors);
                } else {
                    $message = array('error' => $this->lang->line('projects.update.failed'));
                }
            }

            output_json($message);
        } else {
            foreach ((array) $project as $key => $val) {
                $_POST[$key] = $val;
            }
        }

        $this->load->model('clients/clients_m');

        $this->load->view('form', array(
            'clients_dropdown' => client_dropdown('projects', 'create_plus_update'),
            'action' => 'edit',
            'project' => $project->row(),
        ));
    }

    public function delete($project_id = null) {
        (IS_AJAX and can('delete', $this->project_m->getClientIdById($project_id), 'projects', $project_id)) or access_denied();

        if ($_POST) {
            $this->project_m->delete_project($this->input->post('id'));
            $this->session->set_flashdata('success', __('projects:deleted'));
            exit(json_encode(array('success' => 'true')));
        }

        $project = $this->project_m->get_project_by_id($project_id);

        echo $this->load->view('delete', array(
            'project' => $project->row(),
        ), true);
    }

    public function add_expense($project_id) {

        $project = $this->project_m->get_project_by_id($project_id)->row();

        if (!isset($project->id)) {
            access_denied();
        }

        can('create', $project->client_id, 'project_expenses') or access_denied();

        $this->load->model('items/item_m');
        if (!$project)
            show_404();

        if ($_POST) {

            $receipt = "";
            if (isset($_FILES['receipt'])) {
                $buffer = pancake_upload($_FILES['receipt'], null, "expenses");

                if ($buffer and is_array($buffer)) {
                    $buffer = reset($buffer);
                    $receipt = $buffer['folder_name'].$buffer['real_name'];
                }
            }

            if (isset($_POST['due_date']) && !empty($_POST['due_date'])) {
                $due_date = carbon($_POST['due_date']);
            } else {
                $due_date = now();
            }

            $result = $this->project_expense_m->insert(array(
                'name' => $this->input->post('name'),
                'description' => $this->input->post('description'),
                'rate' => $this->input->post('rate'),
                'due_date' => $due_date->toDateString(),
                'supplier_id' => (int) $this->input->post('supplier_id'),
                'category_id' => (int) $this->input->post('category_id'),
                'project_id' => $project->id,
                'receipt' => $receipt,
            ));

            if ($result) {
                $this->session->set_flashdata('success', __('expenses:added'));
                redirect('admin/projects/view/' . $project_id);
            }
        }

        $this->load->model('expenses/expenses_categories_m');
        $this->load->model('expenses/expenses_suppliers_m');

        $data = array(
            'project' => $project,
            'type' => 'expense',
            'suppliers' => $this->expenses_suppliers_m->active()->order_by('name')->get_all(),
            'categories' => $this->expenses_categories_m->get_tiers(null, true),
            'action' => "create",
            'submit_url' => "admin/projects/add_expense/$project_id",
            'project_id' => $project_id,
        );

        $this->load->view('expenses/form', $data);
    }

    public function archive($project_id) {
        can('update', $this->project_m->getClientIdById($project_id), 'projects', $project_id) or access_denied();

        $project = $this->project_m->get_project_by_id($project_id);

        // if ($_POST)
        // {
        $this->project_m->archive_project($project_id);
        // }
        redirect('admin/projects');
    }

    public function unarchive($project_id) {
        can('update', $this->project_m->getClientIdById($project_id), 'projects', $project_id) or access_denied();

        $project = $this->project_m->get_project_by_id($project_id);

        // if ($_POST)
        // {
        $this->project_m->unarchive_project($project_id);
        // }
        redirect('admin/projects');
    }

    function app() {
        $data = array();
        $this->load->model('projects/project_timers_m');
        $data['timers'] = $this->project_timers_m->get_running_timers();

        $data['projects_per_client'] = $this->project_m->get_dropdown_per_client(null, null, false);
        $data['tasks_per_project'] = $this->project_task_m->get_dropdown_per_project(false);

        $buffer = array();
        foreach ($data['projects_per_client'] as $buffer_client_id => $projects) {
            if (!isset($buffer[$buffer_client_id])) {
                $buffer[$buffer_client_id] = array();
            }

            $buffer[$buffer_client_id] = array_keys($projects);
        }

        $data['projects_per_client_order'] = $buffer;

        $buffer = array();
        foreach ($data['tasks_per_project'] as $buffer_client_id => $projects) {
            if (!isset($buffer[$buffer_client_id])) {
                $buffer[$buffer_client_id] = array();
            }

            $buffer[$buffer_client_id] = array_keys($projects);
        }

        $data['tasks_per_project_order'] = $buffer;
        if (count($data['timers']) > 0) {
            $current_task_id = null;

            foreach ($data['timers'] as $task_id => $timer) {
                if ($timer['user_id'] == current_user()) {
                    $current_task_id = $task_id;
                }
            }

            if ($current_task_id) {
                $current_timer = $data['timers'][$current_task_id];
                $project_id = $current_timer['project_id'];
                $client_id = 0;

                foreach ($data['projects_per_client'] as $client => $projects) {
                    foreach (array_keys($projects) as $project) {
                        if ($project == $project_id) {
                            $client_id = $client;
                        }
                    }
                }

                $data['current_timer'] = array(
                    'client_id' => $client_id,
                    'project_id' => $project_id,
                    'task_id' => $current_task_id,
                );
            }
        }

        $this->load->view("projects/timer_app", $data);
    }

}

/* End of file admin.php */