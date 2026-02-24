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
 * The Item Model
 *
 * @subpackage	Models
 * @category	Project
 */
class Project_expense_m extends Pancake_Model {

	public function get_all_expenses_sum($since = null)
	{
            where_assigned('project_expenses', 'read');
            if ($since !== null) {
                $this->db->where("due_date >", date("Y-m-d H:i:s", $since));
            }
		$ret = $this->get_all();
		return $this->_sum_loop($ret);
	}

	public function get_sum_by_project($project_id)
	{
            where_assigned('project_expenses', 'read');
		$ret = $this->get_many_by(array('project_id' => $project_id));
		return $this->_sum_loop($ret);
	}

        function get_for_report($from = null, $to = null, $client_id = null, $business_identity_id = null) {
            where_assigned('project_expenses', 'read');
            $project_expenses_table = $this->db->dbprefix("project_expenses");
            $invoice_rows_table = $this->db->dbprefix("invoice_rows");
            $projects_table = $this->db->dbprefix("projects");

            if ($from > 0) {
                $this->db->where("DATE($project_expenses_table.due_date) >= ", date("Y-m-d", $from));
            }

            if ($to > 0) {
                $this->db->where("DATE($project_expenses_table.due_date) <= ", date("Y-m-d", $to));
            }

            if ($client_id > 0) {
                $this->db->where("client_id", $client_id);
            }

            $this->db
                ->select("$project_expenses_table.id, $project_expenses_table.name, category_id, client_id, currency_id, supplier_id, project_id, $project_expenses_table.due_date, ($project_expenses_table.qty * $project_expenses_table.rate) as amount, invoice_item_id, $invoice_rows_table.unique_id", false)
                ->join($invoice_rows_table, "$invoice_rows_table.id = invoice_item_id", "left")
                ->join($projects_table, "$projects_table.id = project_id", "left");

            if ($business_identity_id > 0) {
                $this->db->where("business_identity", $business_identity_id);
                $this->db->join("clients", "clients.id = client_id");
            }

            $buffer = $this->db
                    ->get($project_expenses_table)
                    ->result_array();

            $categories = get_dropdown("project_expenses_categories", "id", "name");
            $suppliers = get_dropdown("project_expenses_suppliers", "id", "name");
            $projects = get_dropdown("projects", "id", "name");
            $clients_names = get_dropdown("clients", "id", "client_name");
            $invoices = get_dropdown("invoices", "unique_id", "invoice_number");

            foreach ($buffer as $key => $row) {
                $row['category'] = isset($categories[$row['category_id']]) ? $categories[$row['category_id']] : __("global:nolongerexists");
                $row['supplier'] = isset($suppliers[$row['supplier_id']]) ? $suppliers[$row['supplier_id']] : __("global:nolongerexists");
                if ($row['project_id'] > 0) {
                    $row['client']  = $row['client_id'] > 0 ? $clients_names[$row['client_id']] : __("global:nolongerexists");
                    $row['project']  = isset($projects[$row['project_id']]) ? $projects[$row['project_id']] : __("global:nolongerexists");
                } else {
                    $row['client'] = __("global:na");
                    $row['project']  = __('expenses:no_project_business_expense');
                }

                $row['due_date'] = format_date(strtotime($row['due_date'])); # Format the date in the way defined in Pancake Settings.
                $row['is_billed'] = false;

                if ($row['invoice_item_id']) {
                    if ($row['unique_id']) {
                        $row['is_billed'] = true;
                        $row['invoice_number'] = $invoices[$row['unique_id']];
                    } else {
                        # Inconsistent data. This can be caused by manual DB editing of invoices.
                        # It'll likely never happen to a real user, but it's happening in my DB,
                        # so I'm preparing for it regardless. (Sidenote: We really should use DB constraints...) - Bruno
                        $this->mark_as_unbilled($row['invoice_item_id']);
                    }
                }

                if ($row['is_billed']) {
                    $row['billed_amount'] = $row['amount'];
                    $row['unbilled_amount'] = 0;
                } else {
                    $row['billed_amount'] = 0;
                    $row['unbilled_amount'] = $row['amount'];
                }

                $buffer[$key] = $row;
            }

            return $buffer;
        }

        function get_expenses_csv() {
            $return = array(
                "fields" => array("Name", "Client", "Project", "Category", "Supplier", "Expense Date", "Amount", "Currency", "Billed?", "Billed Amount", "Unbilled Amount", "Invoice PDF", "Invoice Number"),
                "records" => array()
            );
            $buffer = $this->get_for_report();

            foreach ($buffer as $row) {
                $data = array(
                    "Name" => $row['name'],
                    "Client" => $row['client'],
                    "Project" => $row['project'],
                    "Category" => $row['category'],
                    "Supplier" => $row['supplier'],
                    "Expense Date" => $row['due_date'],
                    "Amount" => $row['amount'],
                    "Currency" => Currency::code($row['currency_id']),
                    "Billed?" => $row['is_billed'] ? __("global:yes") : __("global:no"),
                    "Billed Amount" => $row['billed_amount'],
                    "Unbilled Amount" => $row['unbilled_amount'],
                    "Invoice PDF" => $row['is_billed'] ? site_url($row['unique_id']) : "",
                    "Invoice Number" => $row['is_billed'] ? $row['invoice_number'] : "",
                );

                $return["records"][] = $data;
            }

            if (!empty($return["records"])) {
                $return["fields"] = array_keys(array_reset($return["records"]));
            }

            return $return;
        }

        function mark_as_billed($row_id, $expense_id) {
            return $this->db->where('id', $expense_id)->update('project_expenses', array('invoice_item_id' => $row_id));
        }

        function get_by_ids($ids) {
            if (count($ids) == 0) {
                return array();
            }

            return $this->db->where_in("id", $ids)->get("project_expenses")->result_array();
        }

        function mark_as_unbilled($row_ids) {
            if (!is_array($row_ids)) {
                $row_ids = array($row_ids);
            }
            if (count($row_ids) > 0) {
                return $this->db->where_in('invoice_item_id', $row_ids)->update('project_expenses', array('invoice_item_id' => '0'));
            }
        }

	public function get_expense_sum_by_project($project_id)
	{
		$ret = $this->get_by(array('project_id' => $project_id));
	}

        function get_for_billing($existing_invoice_rows = array()) {

            if (!in_array(0, $existing_invoice_rows)) {
                $existing_invoice_rows[] = 0;
            }

            $expenses = array();
            where_assigned('project_expenses', 'read');
            $buffer = $this->db->select('id, project_id, name, description, qty, rate, tax_id')->where_in('invoice_item_id', $existing_invoice_rows)->get('project_expenses')->result_array();
            foreach ($buffer as $row) {
                if (!isset($expenses[(int) $row['project_id']])) {
                    $expenses[(int) $row['project_id']] = array();
                }

                $expenses[(int) $row['project_id']][$row['id']] = $row;
            }
            return $expenses;
        }

    public function get_sum_via_client($client_id)
	{
		$un_projects = $this->project_m->get_unarchived_projects('', '', $client_id);
		$ar_projects =	$this->project_m->get_archived_projects('', '', $client_id);

		$projects = array_merge($un_projects, $ar_projects);

		$sum = 0;
		foreach ($projects as $proj)
		{
			$sum += $this->get_sum_by_project($proj->id);
		}

		return $sum;
	}

	private function _sum_loop($ret)
	{
		$sum = 0;
		foreach ($ret as $expense)
		{
			$sum += $expense->qty * $expense->rate;
		}
		return $sum;
	}

    function insert($data, $skip_validation = false) {
        $this->load->model("expenses/expenses_m");
        return $this->expenses_m->insert($data, $skip_validation);
    }

    function update($primary_value, $data, $skip_validation = false) {
        $this->load->model("expenses/expenses_m");
        return $this->expenses_m->update($primary_value, $data, $skip_validation);
    }

}

/* End of file: project_expense_m.php */