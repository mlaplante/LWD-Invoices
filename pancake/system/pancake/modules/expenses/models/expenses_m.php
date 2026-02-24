<?php defined('BASEPATH') OR exit('No direct script access allowed');
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
 * The Expenses Model
 *
 * @subpackage    Models
 * @category      Expenses
 */
class Expenses_m extends Pancake_Model {

    protected $table = 'project_expenses';

    protected $validate = array(
        array(
            'field' => 'name',
            'label' => 'lang:global:name',
            'rules' => 'required|max_length[255]',
        ),
        array(
            'field' => 'description',
            'label' => 'lang:global:description',
            'rules' => '',
        ),
    );

    function getClientIdById($id) {
        $item = $this->db->where('id', $id)->get($this->table)->row_array();
        if (!isset($item['project_id'])) {
            return 0;
        }

        if ($item['project_id'] > 0) {
            $this->load->model('projects/project_m');
            return $this->project_m->getClientIdById($item['project_id']);
        } else if ($item['invoice_id'] > 0) {
            $this->load->model('invoices/invoices_m');
            return $this->invoices_m->getClientIdById($item['invoice_id']);
        }

        return 0;
    }

    function detectClientIdBeforeCreation($project_id = null, $invoice_id = null) {
        if ($project_id > 0) {
            $this->load->model('projects/project_m');
            return $this->project_m->getClientIdById($project_id);
        } else if ($invoice_id > 0) {
            $this->load->model('invoices/invoices_m');
            return $this->invoices_m->getClientIdById($invoice_id);
        }

        return 0;
    }

    public function insert($data, $skip_validation = false) {
        if (!isset($data['owner_id'])) {
            $data['owner_id'] = current_user();
        }

        if (!isset($data['payment_details']) or empty($data['payment_details'])) {
            $data['payment_details'] = '';
        }

        if (!isset($data['invoice_item_id']) or empty($data['invoice_item_id'])) {
            $data['invoice_item_id'] = 0;
        }

        if (isset($data['rate'])) {
            $data['rate'] = process_number($data['rate']);
        }

        return parent::insert($data, $skip_validation);
    }

    public function update($primary_value, $data, $skip_validation = false) {
        if (isset($data['rate'])) {
            $data['rate'] = process_number($data['rate']);
        }

        return parent::update($primary_value, $data, $skip_validation);
    }

    public function get_detailed_expenses($sorted_suppliers = null, $sorted_categories = null, $start = null, $end = null, $sort_by = null, $sort_order = null) {
        where_assigned('project_expenses', 'read');

        switch ($sort_by) {
            case "amount":
                $sort_by = "rate";
                break;
            case "category":
                $sort_by = "project_expenses_categories.name";
                break;
            case "supplier":
                $sort_by = "project_expenses_suppliers.name";
                break;
        }

        if (!empty($sort_by)) {
            $this->db->order_by($sort_by, $sort_order);
        }

        $this->db->select('project_expenses.*,
            project_expenses_suppliers.id as supplier_id,
            project_expenses_suppliers.name as supplier_name,
            projects.name as project_name,
            project_expenses_suppliers.status as supplier_status,
            project_expenses_suppliers.deleted as supplier_deleted,
            project_expenses_categories.id as category_id,
            project_expenses_categories.name as category_name,
            project_expenses_categories.status as category_status,
            project_expenses_categories.deleted as category_deleted')
            ->join('project_expenses_suppliers', 'project_expenses.supplier_id = project_expenses_suppliers.id', 'left')
            ->join('project_expenses_categories', 'project_expenses.category_id = project_expenses_categories.id', 'left')
            ->join('projects', 'project_expenses.project_id = projects.id', 'left');


        if (isset($sorted_suppliers)) {
            $this->db->where_in('project_expenses_suppliers.id', $sorted_suppliers);
        }

        if (isset($sorted_categories)) {
            $this->db->where_in('project_expenses_categories.id', $sorted_categories);
        }

        if (isset($start) && $start != '') {
            $this->db->where('project_expenses.due_date >=', date('Y-m-d', $start));
        }

        if (isset($end) && $end != '') {
            $this->db->where('project_expenses.due_date <=', date('Y-m-d', $end));
        }

        if (isset($project_id) && $project_id != '') {
            $this->db->where('project_expenses.project_id', $project_id);
        }

        return $this->get_all();
    }

    public static function type_dropdown() {
        return array(
            'standard' => __('items:select_standard'),
            'expense' => __('items:select_expense'),
        );
    }

    public function get_earliest_due_date_expense() {
        where_assigned('project_expenses', 'read');
        $buffer = $this->db
            ->select('due_date')
            ->limit(1)
            ->order_by('due_date', 'asc')
            ->get($this->table)
            ->row_array();

        if (isset($buffer['due_date'])) {
            return strtotime($buffer['due_date']);
        } else {
            return time();
        }
    }

    public function get($primary_value) {
        where_assigned('project_expenses', 'read');
        return parent::get($primary_value);
    }

    function count_all() {
        # Override the original function to take into account User Permissions.
        where_assigned('project_expenses', 'read');
        return $this->db->count_all_results($this->table);
    }

    function delete($id) {
        $expense = $this->get($id);

        if (!empty($expense->receipt)) {
            \Pancake\Filesystem\Filesystem::delete("expenses/{$expense->receipt}");
        }

        where_assigned('project_expenses', 'delete');
        return parent::delete($id);
    }

}

/* End of file: expenses_m.php */