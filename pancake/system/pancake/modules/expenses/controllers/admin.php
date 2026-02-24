<?php defined('BASEPATH') OR exit('No direct script access allowed');
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
 * @since		Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * The admin controller for Expenses
 *
 * @subpackage	Controllers
 * @category	Expenses
 */
class Admin extends Admin_Controller
{
	/**
	 * Load models.
	 *
	 * @access	public
	 * @return	void
	 */
	public function __construct()
	{
		parent::__construct();

		$this->load->model('expenses_m');
		$this->load->model('expenses_categories_m');
		$this->load->model('expenses_suppliers_m');
		$this->load->model('projects/project_m');
	}

	// ------------------------------------------------------------------------

	/**
	 * List all expenses.
	 *
	 * @access	public
	 * @return	void
	 */
	public function index($offset = 0)
	{
        $count = $this->expenses_m->count_all();
		$expenses = $this->expenses_m->get_detailed_expenses(null, null, null, null, 'due_date', 'asc');

		$totalRate = 0;

		foreach ($expenses as $expense) {
		    $totalRate += $expense->rate;
		}

		$suppliers = $this->expenses_suppliers_m->active()->order_by('name')->get_all();
		$categories = $this->expenses_categories_m->get_tiers(NULL, TRUE);

		$this->db->order_by("projects.name", "asc");
		$projects = $this->project_m->get_unarchived_projects();

        // Start up the pagination
		$this->load->library('pagination');
        $this->pagination_config['base_url'] = site_url('admin/expenses/index/');
		$this->pagination_config['uri_segment'] = 4;
		$this->pagination_config['total_rows'] = $count;
		$this->pagination->initialize($this->pagination_config);

		$data = array(
			'expenses'		=> $expenses,
			'suppliers'		=> $suppliers,
			'categories'	=> $categories,
			'projects'		=> $projects,
			'total'			=> $totalRate,
		);

                $_GET['suppliers'] = array();
                $_GET['categories'] = array();
                $_GET['sort_by'] = 'due_date';
                $_GET['sort_order'] = 'asc';
                $_GET['formatted_start_date'] = format_date($this->expenses_m->get_earliest_due_date_expense());
                $_GET['formatted_end_date'] = format_date(time());

                foreach ($categories as $category) {
                    $_GET['categories'][] = $category->id;
                    foreach ($category->categories as $sub_category) {
                        $_GET['categories'][] = $sub_category->id;
                    }
                }

                foreach ($suppliers as $supplier) {
                    $_GET['suppliers'][] = $supplier->id;
                }

		$this->template->build('list', $data);
	}

	// ------------------------------------------------------------------------

	/**
	 * Create an expense.
	 *
	 * @access	public
	 * @return	void
	 */
	public function create()
	{
		if ($_POST)
		{

                    $receipt = "";
                    if (isset($_FILES['receipt'])) {
                        $buffer = pancake_upload($_FILES['receipt'], null, "expenses");

                        if ($buffer and is_array($buffer)) {
                            $buffer = reset($buffer);
                            $receipt = $buffer['folder_name'].$buffer['real_name'];
                        }
                    }

                    can('create', $this->expenses_m->detectClientIdBeforeCreation($this->input->post('project_id')), 'project_expenses') or access_denied();

			$insert = array(
				'name'			=> $this->input->post('name'),
				'project_id'	=> (int) $this->input->post('project_id'),
				'supplier_id'	=> $this->input->post('supplier_id'),
				'category_id'	=> $this->input->post('category_id'),
				'rate'			=> ltrim($this->input->post('rate'), '$'),
				'description'	=> $this->input->post('description'),
                                'receipt' => $receipt,
			);

			if ($dueDate = $this->input->post('date'))
			{
				$insert['due_date'] = carbon($dueDate)->toDateString();
			}

			if ($insert['supplier_id'] == 0) {
				$this->session->set_flashdata('error', __("expenses:missing_supplier"));
				redirect('admin/expenses');
			}

			if ($insert['category_id'] == 0) {
				$this->session->set_flashdata('error', __("expenses:missing_category"));
				redirect('admin/expenses');
			}

			if ($this->expenses_m->insert($insert))
			{
				$this->session->set_flashdata('success', lang('expenses:added'));
			}
			else
			{
				$this->session->set_flashdata('error', validation_errors());
			}
		}

		redirect('admin/expenses');
	}

	// ------------------------------------------------------------------------

	/**
	 * Edit an expense.
	 *
	 * @access	public
	 * @return	void
	 */
	public function edit($expense_id)
	{
		$item = $this->expenses_m->get($expense_id);
		if (empty($item) or !can('update', $this->expenses_m->getClientIdById($expense_id), 'project_expenses', $expense_id))
		{
			$this->session->set_flashdata('error', lang('expenses:does_not_exist'));
			redirect('admin/expenses');
		}

                $receipt = $item->receipt;
                if (isset($_FILES['receipt'])) {
                    $buffer = pancake_upload($_FILES['receipt'], null, "expenses");

                    if ($buffer and is_array($buffer)) {
                        $buffer = reset($buffer);
                        $receipt = $buffer['folder_name'].$buffer['real_name'];
                    }
                }

		if ($_POST)
		{

			if ($this->input->post('supplier_id') == 0) {
				$this->session->set_flashdata('error', __("expenses:missing_supplier"));
				redirect('admin/expenses');
			}

			if ($this->input->post('category_id') == 0) {
				$this->session->set_flashdata('error', __("expenses:missing_category"));
				redirect('admin/expenses');
			}

            $due_date = $this->input->post('due_date');
            $due_date = $due_date ? carbon($due_date)->toDateString() : null;

            $result = $this->expenses_m->update($expense_id, array(
                'name' => $this->input->post('name'),
                'description' => $this->input->post('description'),
				'rate'=> $this->input->post('rate'),
				'project_id' => (int) $this->input->post('project_id'),
				'supplier_id' => $this->input->post('supplier_id'),
				'category_id' => $this->input->post('category_id'),
				'due_date' => $due_date,
                                'receipt' => $receipt,
			));

			if ($result)
			{
				$this->session->set_flashdata('success', lang('expenses:edited'));
				redirect('admin/expenses');
			}
			else
			{
				$this->template->error = validation_errors();
			}
		}
		else
		{
			foreach ((array) $item as $key => $val)
			{
				$_POST[$key] = $val;
			}
			if($_POST['due_date']){
				$_POST['due_date'] = format_date(strtotime($item->due_date));
			}
		}

		$suppliers = $this->expenses_suppliers_m->active()->order_by('name')->get_all();
		$categories = $this->expenses_categories_m->get_tiers(NULL, TRUE);
		$projects = $this->project_m->get_unarchived_projects();

		$data = array(
			'action_type' => 'edit',
			'item_id' => $expense_id,
			'action' => 'edit/'.$expense_id,
			'expense' => $item,
			'suppliers' => $suppliers,
			'categories' => $categories,
			'projects' => $projects,
		);

		$this->load->view('form', $data);
	}

	// ------------------------------------------------------------------------

	/**
	 * Delete an expense.
	 *
	 * @access	public
	 * @return	void
	 */
	public function delete($expense_id)
	{
		$item = $this->expenses_m->get($expense_id);

                if (empty($item) or !can('delete', $this->expenses_m->getClientIdById($expense_id), 'project_expenses', $expense_id))
		{
			$this->session->set_flashdata('error', lang('expenses:does_not_exist'));
			redirect('admin/expenses');
		}

		if ($_POST)
		{
			// Check to make sure the action hash matches, if not kick em' to the curb
			if ($this->input->post('action_hash') !== $this->session->userdata('action_hash'))
			{
				$this->session->set_flashdata('error', lang('global:insecure_action'));
				redirect('admin/dashboard');
			}

            # This deletes all invoices, projects and proposals related to the item.
			$this->expenses_m->delete($expense_id);
			$this->session->set_flashdata('success', lang('expenses:deleted'));
			redirect('admin/expenses');
		}

		// We set a unique action hash here to stop CSRF attacks (hacker's beware)
		$action_hash = md5(time().$expense_id);
		$this->session->set_userdata('action_hash', $action_hash);

		// Lets make sure before we just go killing stuff like Rambo
		$this->template->build('are_you_sure', array(
			'item' => $item,
			'action_hash' => $action_hash,
		));
	}

	public function ajax_delete_entry() {

            $this->expenses_m->delete($this->input->post('id'));
        }

	// ------------------------------------------------------------------------

	/**
	 * View an individual expense.
	 *
	 * @access	public
	 * @param	string	The item id
	 * @return	void
	 */
	public function view($expense_id)
	{
		if ( ! $item = $this->expenses_m->get($expense_id))
		{
			$this->session->set_flashdata('error', lang('expenses:does_not_exist'));
			redirect('admin/expenses');
		}

		$this->template->build('view', array(
			'item' => $item,
		));
	}

	// -----------------------------------------------------------------------

	/**
	 * Sort expenses.
	 *
	 * @return void
	 */
	public function sort()
	{
		$params = $this->input->get();

		$sorted_suppliers = null;
		$sorted_categories = null;
		$start = null;
		$end = null;
		$project_id = null;

		$sorted_suppliers =  $this->input->get('suppliers');

		$sorted_categories = $this->input->get('categories');

                $sort_by = $this->input->get('sort_by');
                $sort_order = $this->input->get('sort_order');

		$start = $this->input->get('start_date');
		$end = $this->input->get('end_date');

		if (!empty($start)) {
			$start = carbon($start)->timestamp;
		}

		if (!empty($end)) {
			$end = carbon($end)->timestamp;
		}

                $_GET['formatted_start_date'] = empty($start) ? "" : format_date($start);
                $_GET['formatted_end_date'] = empty($end) ? "" : format_date($end);

		$project_id = $this->input->get('project_id');

		$expenses = $this->expenses_m->get_detailed_expenses($sorted_suppliers, $sorted_categories, $start, $end, $sort_by, $sort_order);

		$values = array(
		    'rate' => 0,
		);
		foreach ($expenses as $expense) {
		    $values['rate'] += $expense->rate;
		}

		$total = array_sum($values);

		$suppliers = $this->expenses_suppliers_m->active()->order_by('name')->get_all();
		$categories = $this->expenses_categories_m->get_tiers(NULL, TRUE);

		$projects = $this->project_m->get_unarchived_projects();

		$data = array(
			'expenses' => $expenses,
			'suppliers' => $suppliers,
			'categories' => $categories,
			'projects' => $projects,
			'total'		=>	$total
		);

		$this->template->build('list', $data);
	}

	/**
	 * [sort_form description]
	 *
	 * @return void
	 */
	public function sort_form()
	{
		$suppliers = $this->expenses_suppliers_m->active()->order_by('name')->get_all();
		$categories = $this->expenses_categories_m->get_tiers(NULL, TRUE);

		$projects = $this->project_m->get_unarchived_projects();

		$data = array(
			'suppliers' => $suppliers,
			'categories' => $categories,
			'projects' => $projects,
                        'sort_order' => "desc",
                        'sort_by' => "due_date",
		);

		$this->load->view('sort_form', $data);
	}

	// ------------------------------------------------------------------------

	/**
	 * Create an expense supplier.
	 *
	 * @access	public
	 * @return	void
	 */
	public function suppliers()
	{

            is_admin() or access_denied();

		if ($_POST)
		{
            $postBuffer = $_POST;

			if ($result = $this->expenses_suppliers_m->insert($postBuffer))
			{
				$this->session->set_flashdata('success', lang('expenses:supplier_added'));
				redirect('admin/expenses/suppliers');
			}
			else
			{
				die(validation_errors());
			}
		}

		$this->template->suppliers = $this->expenses_suppliers_m->order_by('name')->get_all();
		$this->template->action_type = 'add';
		$this->template->action = 'create';
		$this->template->build('suppliers_list');
	}

	/**
	 * Edit an expense supplier.
	 *
	 * @access	public
	 * @return	void
	 */
	public function edit_supplier($supplier_id)
	{

            is_admin() or access_denied();

		if ( ! $supplier = $this->expenses_suppliers_m->get($supplier_id))
		{
			$this->session->set_flashdata('error', lang('expenses:supplier_does_not_exist'));
			redirect('admin/expenses/suppliers');
		}

		if ($_POST)
		{
			$postBuffer = $_POST;

			$postBuffer['deleted'] = isset($_POST['deleted']) && $_POST['deleted'] == 1 ? 1 : 0;

			if ($result = $this->expenses_suppliers_m->update($supplier_id, $postBuffer))
			{
				$this->session->set_flashdata('success', lang('expenses:supplier_edited'));
				redirect('admin/expenses/suppliers');
			}
			else
			{
				die(validation_errors());
			}
		}
		else
		{
			foreach ((array) $supplier as $key => $val)
			{
				$_POST[$key] = $val;
			}
		}

		$data = array(
			'action_type' => 'edit',
			'supplier_id' => $supplier_id,
			'supplier' => $supplier,
			'action' => $supplier_id,
		);

		$this->load->view('suppliers_form', $data);
	}

	// ------------------------------------------------------------------------

	/**
	 * Create an expense category.
	 *
	 * @access	public
	 * @return	void
	 */
	public function categories()
	{

            is_admin() or access_denied();

		if ($_POST)
		{
            $postBuffer = array(
            	'name' => $this->input->post('name'),
            	'parent_id' => $this->input->post('parent_id') ? $this->input->post('parent_id') : NULL,
            	'description' => $this->input->post('description'),
            	'notes' => $this->input->post('notes'),
            );

			if ($result = $this->expenses_categories_m->insert($postBuffer))
			{
				$this->session->set_flashdata('success', __('expenses:category_added'));
				redirect('admin/expenses/categories');
			}
			else
			{
				die(validation_errors());
			}
		}

		$this->template->category_parents = $this->expenses_categories_m->get_parents();
		$this->template->categories = $this->expenses_categories_m->join_parent()->order_by('name')->get_all();
		$this->template->action_type = 'add';
		$this->template->action = 'create';
		$this->template->build('categories_list');
	}

	/**
	 * Edit an expense category.
	 *
	 * @access	public
	 * @return	void
	 */
	public function edit_category($category_id)
	{

            is_admin() or access_denied();

		if ( ! $category = $this->expenses_categories_m->get($category_id))
		{
			$this->session->set_flashdata('error', lang('expenses:category_does_not_exist'));
			redirect('admin/expenses/categories');
		}

		if ($_POST)
		{
			$postBuffer = $_POST;

			$postBuffer['deleted'] = isset($_POST['deleted']) && $_POST['deleted'] == 1 ? 1 : 0;
			$postBuffer['parent_id'] = (int) $postBuffer['parent_id'];

			if ($result = $this->expenses_categories_m->update($category_id, $postBuffer))
			{
				$this->session->set_flashdata('success', lang('expenses:category_edited'));
				redirect('admin/expenses/categories');
			}
			else
			{
				die(validation_errors());
			}
		}
		else
		{
			foreach ((array) $category as $key => $val)
			{
				$_POST[$key] = $val;
			}
		}

		$categories = $this->expenses_categories_m->get_parents();

		$dropdown = array('' => __('expenses:parent_category'));
		foreach($categories as $cat){
			$dropdown[$cat->id] = $cat->name;
		}

		$data = array(
			'parent_categories' => $dropdown,
			'action_type' => 'edit',
	        'supplier_id' => $category_id,
			'category' => $category,
			'action' => $category_id,
		);

		$this->load->view('categories_form', $data);
	}
}

/* End of file: admin.php */