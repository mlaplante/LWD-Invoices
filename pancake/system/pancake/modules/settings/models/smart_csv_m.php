<?php

defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package             Pancake
 * @author              Pancake Dev Team
 * @copyright           Copyright (c) 2013, Pancake Payments
 * @license             http://pancakeapp.com/license
 * @link                http://pancakeapp.com
 * @since               Version 4.0
 */
// ------------------------------------------------------------------------

/**
 * The Smart CSV Import Model
 *
 * @subpackage    Models
 * @category      Smart_CSV
 */
class Smart_csv_m extends Pancake_Model {

    protected $required_errors = array();
    protected $invalid_errors = array();
    protected $max_items = 10;
    protected $max_payments = 5;
    protected $ci = array();

    public function __construct() {
        parent::__construct();

        $this->ci = get_instance();
        $this->ci->load->model('clients/clients_m');
        $this->ci->load->model('clients/clients_credit_alterations_m');
        $this->ci->load->model('users/user_m');
        $this->ci->load->model('settings/currency_m');
        $this->ci->load->model('settings/tax_m');
        $this->ci->load->model('projects/project_m');
        $this->ci->load->model('projects/project_milestone_m');
        $this->ci->load->model('projects/project_task_statuses_m');
        $this->ci->load->model('projects/project_task_m');
        $this->ci->load->model('projects/project_time_m');
        $this->ci->load->model('expenses/expenses_categories_m');
        $this->ci->load->model('expenses/expenses_suppliers_m');
        $this->ci->load->model('invoices/invoice_m');
        $this->ci->load->model('invoices/partial_payments_m', 'ppm');
    }

    function get_required_errors() {
        return $this->required_errors;
    }

    function get_invalid_errors() {
        return $this->invalid_errors;
    }

    function errored() {
        return count($this->required_errors) > 0 or count($this->invalid_errors) > 0;
    }

    function get_fields($import_type) {

        $items = array();
        for ($i = 1; $i <= $this->max_items; $i++) {
            $items = array_merge($items, array(
                'item_' . $i . '_name' => "Item $i Name",
                'item_' . $i . '_description' => "Item $i Description",
                'item_' . $i . '_quantity' => "Item $i Quantity",
                'item_' . $i . '_rate' => "Item $i Rate",
                'item_' . $i . '_tax' => "Item $i Tax (Name, Percentage or Amount)",
                'item_' . $i . '_discount' => "Item $i Discount",
            ));
        }

        $payments = array();
        for ($i = 1; $i <= $this->max_payments; $i++) {
            $payments = array_merge($payments, array(
                'payment_' . $i . '_amount' => "Payment $i Amount",
                'payment_' . $i . '_due_date' => "Payment $i Due Date",
                'payment_' . $i . '_notes' => "Payment $i Notes",
                'payment_' . $i . '_is_paid' => "Payment $i Is Paid?",
                'payment_' . $i . '_payment_method' => "Payment $i Payment Method",
                'payment_' . $i . '_payment_date' => "Payment $i Payment Date",
                'payment_' . $i . '_txn_id' => "Payment $i Transaction ID",
                'payment_' . $i . '_transaction_fee' => "Payment $i Transaction Fee",
            ));
        }

        switch ($import_type) {
            case 'invoices':
                return array_merge(array(
                    'client_id' => "Client",
                    'invoice_number' => "Invoice #",
                    'date_entered' => "Date of Creation",
                    'notes' => "Notes",
                    'description' => "Description",
                    'is_viewable' => "Show in client area?",
                    'currency_id' => "Currency",
                ), $items, $payments);
                break;
            case 'estimates':
                return array_merge(array(
                    'client_id' => "Client",
                    'invoice_number' => "Estimate #",
                    'date_entered' => "Date of Creation",
                    'notes' => "Notes",
                    'description' => "Description",
                    'is_viewable' => "Show in client area?",
                    'currency_id' => "Currency",
                ), $items);
                break;
            case 'credit_notes':
                return array_merge(array(
                    'client_id' => "Client",
                    'invoice_number' => "Credit Note #",
                    'date_entered' => "Date of Creation",
                    'notes' => "Notes",
                    'description' => "Description",
                    'is_viewable' => "Show in client area?",
                    'currency_id' => "Currency",
                ), $items);
                break;
            case 'clients':
                return array(
                    'title' => "Title",
                    'first_name' => "First Name",
                    'last_name' => "Last Name",
                    'email' => "Email",
                    'company' => "Company",
                    'address' => "Address",
                    'phone' => "Phone",
                    "fax" => "Fax",
                    "mobile" => "Mobile",
                    'website' => "Website",
                    'profile' => "Notes",
                    'passphrase' => "Passphrase",
                    'created' => "Date of Creation",
                    'credit_balance' => "Credit Balance",
                );
                break;
            case 'projects':
                return array(
                    'name' => "Project Name",
                    'client_id' => "Client",
                    'due_date' => "Due Date",
                    'description' => "Description",
                    'date_entered' => "Date of Creation",
                    'rate' => "Hourly Rate",
                    'completed' => "Completed?",
                    'currency_id' => "Currency",
                    'is_viewable' => "Show in client area?",
                    'projected_hours' => "Projected Hours",
                    'is_archived' => "Archived?",
                );
                break;
            case 'expenses':
                return array(
                    'name' => "Expense Name",
                    'rate' => "Amount",
                    'project_id' => 'Project',
                    'supplier_id' => 'Supplier',
                    'category_id' => 'Category',
                    'due_date' => "Date",
                    'description' => "Description",
                    'receipt' => "Receipt (URL)",
                );
                break;
            case 'tasks':
                return array(
                    'name' => "Name",
                    'project_id' => 'Project',
                    'milestone_id' => 'Milestone',
                    'parent_id' => 'Task Parent',
                    'rate' => "Hourly Rate",
                    'projected_hours' => "Projected Hours",
                    'notes' => "Notes",
                    'due_date' => "Due Date",
                    'completed' => "Completed?",
                    'is_viewable' => "Show in client area?",
                    'status_id' => "Task Status",
                    'assigned_user_id' => "Assigned User",
                );
                break;
            case 'time_entries':
                return array(
                    'client_id' => "Client",
                    'project_id' => "Project",
                    'task_id' => "Task",
                    'user_id' => "User",
                    'start_time' => "Start Time",
                    'end_time' => "End Time",
                    'hours' => "Hours",
                    'date' => "Date",
                    'note' => "Notes",
                );
                break;
            case 'users':
                return array(
                    'username' => "Username",
                    'password' => "Password",
                    'email' => "Email",
                    'first_name' => "First Name",
                    'last_name' => "Last Name",
                    'company' => "Company",
                    'phone' => "Phone",
                );
                break;
        }
    }

    function get_textareas($import_type) {

        $items = array();
        for ($i = 1; $i <= $this->max_items; $i++) {
            $items[] = 'item_' . $i . '_description';
        }

        switch ($import_type) {
            case 'invoices':
                return array_merge(array(
                    'description', 'notes',
                ), $items);
                break;
            case 'estimates':
                return array_merge(array(
                    'description', 'notes',
                ), $items);
                break;
            case 'credit_notes':
                return array_merge(array(
                    'description', 'notes',
                ), $items);
                break;
            case 'tasks':
                return array('notes');
                break;
            case 'clients':
                return array(
                    'address', 'profile',
                );
                break;
            case 'projects':
                return array(
                    'description',
                );
                break;
            case 'expenses':
                return [
                    'description'
                ];
                break;
            case 'time_entries':
                return array(
                    'note',
                );
                break;
            case 'users':
                return array();
                break;
        }
    }

    function get_requireds($import_type) {
        switch ($import_type) {
            case 'invoices':
                return array(
                    'client_id',
                );
                break;
            case 'estimates':
                return array(
                    'client_id',
                );
                break;
            case 'credit_notes':
                return array(
                    'client_id',
                );
                break;
            case 'clients':
                return array(
                    'email',
                );
                break;
            case 'tasks':
                return array('name', 'project_id');
                break;
            case 'projects':
                return array(
                    'name',
                    'client_id',
                );
                break;
            case 'expenses':
                return [
                    'name',
                    'rate',
                ];
                break;
            case 'time_entries':
                return array(
                    'task_id',
                    'user_id',
                    'hours',
                    'date',
                );
                break;
            case 'users':
                return array(
                    'username',
                    'password',
                    'email',
                    'first_name',
                );
                break;
        }
    }

    function get_field_types($import_type) {

        $items = array();
        for ($i = 1; $i <= $this->max_items; $i++) {
            $items = array_merge($items, array(
                'item_' . $i . '_quantity' => "number",
                'item_' . $i . '_rate' => "number",
                'item_' . $i . '_tax' => "tax",
                'item_' . $i . '_discount' => "number_or_percentage",
            ));
        }

        $payments = array();
        for ($i = 1; $i <= $this->max_payments; $i++) {
            $payments = array_merge($payments, array(
                'payment_' . $i . '_amount' => "number_or_percentage",
                'payment_' . $i . '_due_date' => "datetime",
                'payment_' . $i . '_is_paid' => "boolean",
                'payment_' . $i . '_payment_method' => "gateway",
                'payment_' . $i . '_payment_date' => "datetime",
                'payment_' . $i . '_transaction_fee' => "number_or_percentage",
            ));
        }

        switch ($import_type) {
            case 'invoices':
                return array_merge(array(
                    'client_id' => 'client',
                    'date_entered' => 'datetime',
                    'is_viewable' => 'boolean',
                    'currency_id' => 'currency',
                ), $items, $payments);
                break;
            case 'estimates':
            case 'credit_notes':
                return array_merge(array(
                    'client_id' => 'client',
                    'date_entered' => 'datetime',
                    'is_viewable' => 'boolean',
                    'currency_id' => 'currency',
                ), $items);
                break;
            case 'tasks':
                return array(
                    'project_id' => 'project',
                    'milestone_id' => 'milestone',
                    'parent_id' => 'task',
                    'rate' => 'number',
                    'projected_hours' => 'hours',
                    'notes' => 'text',
                    'due_date' => 'datetime',
                    'completed' => 'boolean',
                    'is_viewable' => 'boolean',
                    'status_id' => 'task_status',
                    'assigned_user_id' => 'user',
                );
                break;
            case 'clients':
                return array(
                    'email' => 'email',
                    'created' => 'datetime',
                    'website' => 'url',
                    'credit_balance' => 'number',
                );
                break;
            case 'projects':
                return array(
                    'client_id' => 'client',
                    'due_date' => 'datetime',
                    'date_entered' => 'datetime',
                    'rate' => 'number',
                    'completed' => 'boolean',
                    'currency_id' => 'currency',
                    'is_viewable' => 'boolean',
                    'projected_hours' => 'hours',
                    'is_archived' => 'boolean',
                );
                break;
            case 'expenses':
                return array(
                    'rate' => 'number',
                    'project_id' => 'project',
                    'supplier_id' => 'supplier',
                    'category_id' => 'category',
                    'due_date' => 'datetime',
                    'receipt' => 'url',
                );
                break;
            case 'time_entries':
                return array(
                    'client_id' => 'client',
                    'project_id' => 'project',
                    'task_id' => 'task',
                    'user_id' => 'user',
                    'start_time' => 'time',
                    'end_time' => 'time',
                    'hours' => 'hours',
                    'date' => 'datetime',
                );
                break;
            case 'users':
                return array(
                    'email' => 'email',
                );
                break;
        }
    }

    function validate_records(&$records, $import_type) {
        $errored = false;

        # Process Records
        $i = 0;
        foreach ($records as $key => $record) {

            $i++;

            foreach (array_keys($this->get_fields($import_type)) as $field) {
                if (!isset($record[$field])) {
                    $records[$key][$field] = '';
                }
            }

            foreach ($this->get_requireds($import_type) as $required) {
                if (empty($record[$required])) {
                    $this->required_errors[] = array(
                        'record' => $i,
                        'field' => $required,
                    );
                    $errored = true;
                }
            }

            foreach ($this->get_field_types($import_type) as $field => $type) {
                if (in_array(array('record' => $i, 'field' => $field), $this->required_errors)) {
                    # This is missing, so it's obviously going to be invalid.
                    # No need giving the user two error notices for the same field.
                    continue;
                }

                if (empty($record[$field])) {
                    # It is missing, but is not required,
                    # so it's obviously OK to let it through.
                    continue;
                }

                switch ($type) {
                    case 'email':
                        $regex = "/^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/";

                        $record[$field] = explode(",", $record[$field]);
                        foreach ($record[$field] as $email) {
                            $email = trim($email);
                            if (!preg_match($regex, $email)) {
                                $this->invalid_errors[] = array(
                                    'record' => $i,
                                    'field' => $field,
                                );
                                $errored = true;
                                break;
                            }
                        }
                        break;
                    case 'url':
                        $regex = "/(?i)\\b((?:https?:\/\/|www\\d{0,3}[.]|[a-z0-9.\\-]+[.][a-z]{2,4}\/)(?:[^\\s()<>]+|\\(([^\\s()<>]+|(\\([^\\s()<>]+\\)))*\\))+(?:\\(([^\\s()<>]+|(\\([^\\s()<>]+\\)))*\\)|[^\\s`!()\\[\\]{};:'\".,<>?«»“”‘’]))/";
                        if (!preg_match($regex, $record[$field])) {
                            $this->invalid_errors[] = array(
                                'record' => $i,
                                'field' => $field,
                            );
                            $errored = true;
                        }
                        break;
                    case 'datetime':
                        if ((string) (int) $record[$field] != $record[$field]) {
                            # It's not a timestamp; check if PHP will be able to understand it.
                            if (strtotime($record[$field]) === false) {
                                $this->invalid_errors[] = array(
                                    'record' => $i,
                                    'field' => $field,
                                );
                                $errored = true;
                            }
                        }
                        break;
                    case 'time':
                        # Check if PHP will be able to understand it.

                        $record[$field] = str_ireplace('.', ':', $record[$field]);
                        if (stristr($record[$field], 'p') !== false and stristr($record[$field], 'pm') === false) {
                            # Has p, but not pm.
                            $record[$field] = str_ireplace('p', 'pm', $record[$field]);
                        }

                        if (stristr($record[$field], 'a') !== false and stristr($record[$field], 'am') === false) {
                            # Has a, but not am.
                            $record[$field] = str_ireplace('a', 'am', $record[$field]);
                        }

                        if (strtotime($record[$field]) === false) {
                            $this->invalid_errors[] = array(
                                'record' => $i,
                                'field' => $field,
                            );
                            $errored = true;
                        }
                        break;
                    case 'boolean':
                        $regex = "/^(true|false|yes|no|1|0|y|n)$/i";
                        if (!preg_match($regex, $record[$field])) {
                            $this->invalid_errors[] = array(
                                'record' => $i,
                                'field' => $field,
                            );
                            $errored = true;
                        }
                        break;
                    case 'number':
                        $regex = "/([0-9]+(?:\.[0-9]+)?)/";
                        if (!preg_match($regex, $record[$field])) {
                            $this->invalid_errors[] = array(
                                'record' => $i,
                                'field' => $field,
                            );
                            $errored = true;
                        }
                        break;
                    case 'currency':
                    case 'user':
                    case 'project':
                    case 'task_status':
                        $models = array(
                            'currency' => 'currency_m',
                            'task' => 'project_task_m',
                            'user' => 'user_m',
                            'project' => 'project_m',
                            'task_status' => 'project_task_statuses_m',
                            'supplier' => 'expenses_suppliers_m',
                            'category' => 'expenses_categories_m',
                        );

                        $model = $models[$type];
                        $result = $this->ci->$model->search($record[$field]);
                        if (!isset($result[0]) or $result[0]['levenshtein'] > 0) {
                            $this->invalid_errors[] = array(
                                'record' => $i,
                                'field' => $field,
                            );
                            $errored = true;
                        }
                        break;
                    case 'milestone':
                        $value = $record['project_id'];
                        $this->process_existing_record($value, 'project_m');
                        $result = $this->ci->project_milestone_m->search($record[$field], $value);
                        if (!isset($result[0]) or $result[0]['levenshtein'] > 0) {
                            $this->invalid_errors[] = array(
                                'record' => $i,
                                'field' => $field,
                            );
                            $errored = true;
                        }
                        break;
                    case 'hours':
                        $regex = "/([0-9]+(?:\.[0-9]+)?)/";
                        if (!preg_match($regex, $record[$field]) and stristr($record[$field], ':') === false) {
                            # It's not a number, and it hasn't got hours:minutes[:seconds]. It's invalid.
                            $this->invalid_errors[] = array(
                                'record' => $i,
                                'field' => $field,
                            );
                            $errored = true;
                        }
                        break;
                }
            }
        }

        if ($errored) {
            return false;
        }

        return $records;
    }

    function process_currency(&$record) {
        if (!empty($record['currency_id'])) {
            $result = $this->ci->currency_m->search($record['currency_id']);
            $currency_code = isset($result[0]) ? $result[0]['id'] : Settings::get('currency');
            $currency = $this->ci->currency_m->getByCode($currency_code);

            $record['currency_id'] = $currency['id'];
            $record['exchange_rate'] = $currency['rate'];
        } else {
            $record['currency_id'] = 0;
            $record['exchange_rate'] = 1;
        }
    }

    function process_hours(&$value) {
        $value = process_hours($value);
    }

    function process_date(&$value, $now_if_empty = true) {
        if (empty($value)) {
            if ($now_if_empty) {
                $value = time();
            } else {
                $value = 0;
            }
        } else {
            $value = strtotime($value);
        }
    }

    function process_time(&$value) {
        $value = str_ireplace('.', ':', $value);
        if (stristr($value, 'p') !== false and stristr($value, 'pm') === false) {
            # Has p, but not pm.
            $value = str_ireplace('p', 'pm', $value);
        }

        if (stristr($value, 'a') !== false and stristr($value, 'am') === false) {
            # Has a, but not am.
            $value = str_ireplace('a', 'am', $value);
        }

        $value = date('H:i', strtotime($value));
    }

    function process_existing_record(&$value, $model) {
        $result = $this->ci->$model->search($value);
        $value = (!isset($result[0]) or $result[0]['levenshtein'] > 0) ? 0 : $result[0]['id'];
    }

    function process_project_id(&$value, $client_id = null) {
        if ($client_id > 0) {
            $this->db->where("client_id", $client_id);
        }
        $result = $this->ci->project_m->search($value);
        $value = (!isset($result[0]) or $result[0]['levenshtein'] > 0) ? 0 : $result[0]['id'];
    }

    function process_supplier(&$value, $client_id = null) {
        if ($client_id > 0) {
            $this->db->where("client_id", $client_id);
        }
        $result = $this->ci->expenses_suppliers_m->search($value);

        if (!isset($result[0]) or $result[0]['levenshtein'] > 0) {
            # Create the category:
            $value = $this->ci->expenses_suppliers_m->insert([
                "name" => $value,
            ]);
        } else {
            $value = $result[0]['id'];
        }
    }

    function process_category(&$value, $client_id = null) {
        if ($client_id > 0) {
            $this->db->where("client_id", $client_id);
        }
        $result = $this->ci->expenses_categories_m->search($value);

        if (!isset($result[0]) or $result[0]['levenshtein'] > 0) {
            # Create the category:
            $value = $this->ci->expenses_categories_m->insert([
                "name" => $value,
            ]);
        } else {
            $value = $result[0]['id'];
        }

    }

    function process_task(&$value, $client_id = null, $project_id = null) {
        if ($client_id > 0) {
            $this->db->where("client_id", $client_id);
        }

        if ($project_id > 0) {
            $this->db->where("project_id", $project_id);
        }

        $result = $this->ci->project_task_m->search($value);

        if (!isset($result[0]) or $result[0]['levenshtein'] > 0) {
            # Create the task:
            $this->load->model("projects/project_task_m");
            $value = $this->project_task_m->quick_add($value, $project_id);
        } else {
            $value = $result[0]['id'];
        }
    }

    function process_gateway(&$value) {
        require_once APPPATH . 'modules/gateways/gateway.php';
        $result = Gateway::search($value);
        $value = (!isset($result[0]) or $result[0]['levenshtein'] > 0) ? null : $result[0]['id'];
    }

    function process_client(&$value) {
        $result = $this->ci->clients_m->search($value);
        if (isset($result[0]) and $result[0]['levenshtein'] > 0) {
            # Create the client:
            $name = explode(' ', $value);
            $first_name = $name[0];
            unset($name[0]);
            $last_name = implode(' ', $name);

            $value = $this->ci->clients_m->insert([
                'first_name' => $first_name,
                'last_name' => $last_name,
                'email' => Business::getNotifyEmail(),
                'created' => now()->toDateTimeString(),
            ]);
        } else {
            $value = $result[0]['id'];
        }
    }

    function process_number(&$value) {
        $value = process_number($value);
    }

    function process_boolean(&$value) {
        $value = preg_match("/^(true|yes|1|y)$/i", $value) === 1;
    }

    function process_tax(&$value, $total) {
        $regex = "/([0-9]+(?:\.[0-9]+)?)/";
        $matches = array();
        $result = preg_match($regex, $value, $matches);
        if ($result === 1) {
            if (stristr($value, '%') === false) {
                # It's a fixed value, turn to percentage.
                $this->process_number($value);

                # Only process value if necessary; if it's 0 then it doesn't matter what the total is.
                if ($value > 0) {
                    $value = ($value / $total) * 100;
                }
            }

            # It's a percentage, search for existing tax or create new one if necessary.
            if ($value > 0) {
                $value = $this->ci->tax_m->create_if_not_exists($value);
            }
        } else {
            $this->process_existing_record($value, 'tax_m');
        }
    }

    function process_tax_including_ids(&$value) {
        $regex = "/([0-9]+(?:\.[0-9]+)?)/";
        $matches = array();
        $result = preg_match($regex, $value, $matches);
        if ($result === 1) {
            if (stristr($value, '%') === false) {
                # It's an ID.
                $this->process_number($value);
            } else {
                # It's a percentage, search for existing tax or create new one if necessary.
                if ($value > 0) {
                    $value = $this->ci->tax_m->create_if_not_exists($value);
                }
            }
        } else {
            # It's a name, look for the record.
            $this->process_existing_record($value, 'tax_m');
        }
    }

    function process(&$record, $import_type) {

        switch ($import_type) {
            case 'invoices':
            case 'estimates':
            case 'credit_notes':
                $this->process_date($record['date_entered']);
                $this->process_currency($record);
                $record['unique_id'] = $this->ci->invoice_m->_generate_unique_id();
                $this->process_boolean($record['is_viewable']);
                $record['owner_id'] = current_user();
                $this->process_client($record['client_id']);

                switch ($import_type) {
                    case "invoices":
                        $record['type'] = 'DETAILED';
                        break;
                    case "estimates":
                        $record['type'] = 'ESTIMATE';
                        break;
                    case "credit_notes":
                        $record['type'] = 'CREDIT_NOTE';
                        break;
                }

                $items = [
                    "name" => [],
                    "qty" => [],
                    "rate" => [],
                    "tax_id" => [],
                    "item_time_entries" => [],
                    "item_type_id" => [],
                    "type" => [],
                    "discount" => [],
                    "description" => [],
                ];

                for ($i = 1; $i <= $this->max_items; $i++) {
                    $period = 1;
                    $rate = process_number($record['item_' . $i . '_rate']);
                    $quantity = process_number($record['item_' . $i . '_quantity']);
                    if ($rate != 0 or $quantity != 0) {
                        $type = "standard";
                        $discount = $record['item_' . $i . '_discount'];
                        $items["name"][] = $record['item_' . $i . '_name'];
                        $items["qty"][] = $quantity;
                        $items["rate"][] = $rate;
                        $items["description"][] = $record['item_' . $i . '_description'];
                        $items["discount"][] = $discount;
                        $items["type"][] = $type;
                        $items["item_time_entries"][] = "";
                        $items["item_type_id"][] = "";

                        $this->process_tax($record['item_' . $i . '_tax'], $this->invoice_m->calculate_item_total($type, $quantity, $rate, $period, $discount));
                        $items["tax_id"][] = [$record['item_' . $i . '_tax']];
                    }
                }

                $items = $this->invoice_m->build_invoice_rows_from_input($items);
                $this->invoice_m->insert_invoice_rows($record['unique_id'], $items);

                $record['frequency'] = 'm';
                $record['send_x_days_before'] = Settings::get('send_x_days_before');
                if ($import_type == "invoices" && !empty($record['payment_date'])) {
                    $record['last_sent'] = $record['payment_date'];
                    $record['last_viewed'] = $record['payment_date'];
                } else {
                    $record['last_sent'] = 0;
                    $record['last_viewed'] = 0;
                }

                if ($import_type == "invoices") {
                    $payments_added = 0;
                    $key = 1;
                    for ($i = 1; $i <= $this->max_payments; $i++) {
                        $is_percentage = stristr($record['payment_' . $i . '_amount'], "%") !== false;
                        $amount = process_number($record['payment_' . $i . '_amount']);

                        if ($amount > 0) {
                            $this->process_date($record['payment_' . $i . '_due_date'], false);
                            $this->process_boolean($record['payment_' . $i . '_is_paid']);
                            $this->process_number($record['payment_' . $i . '_transaction_fee']);
                            $is_paid = $record['payment_' . $i . '_is_paid'];
                            $this->process_date($record['payment_' . $i . '_payment_date']);
                            $this->process_gateway($record['payment_' . $i . '_payment_method']);
                            $payment_method = $record['payment_' . $i . '_payment_method'];

                            if ($is_paid && empty($payment_method)) {
                                $payment_method = "cash_m";
                            }

                            $partial_payment = array(
                                'unique_invoice_id' => $record['unique_id'],
                                'is_percentage' => $is_percentage,
                                'due_date' => $record['payment_' . $i . '_due_date'],
                                'unique_id' => $this->ci->ppm->_generate_unique_id(),
                                'key' => $key,
                                'improved' => 1,
                                'is_paid' => $is_paid,
                                'amount' => $amount,
                                'payment_date' => $record['payment_' . $i . '_payment_date'],
                                'payment_gross' => $is_percentage ? 0 : $amount,
                                'gateway_surcharge' => 0,
                                'transaction_fee' => $record['payment_' . $i . '_transaction_fee'],
                                'payment_status' => $is_paid ? "Completed" : "",
                                'payment_method' => $is_paid ? $payment_method : "",
                                'payment_type' => '',
                                'notes' => '',
                                'item_name' => '',
                                'payer_status' => '',
                            );

                            $payments_added++;
                            $key++;
                            $this->db->insert('partial_payments', $partial_payment);
                        }
                    }

                    if ($payments_added == 0) {
                        $default_due_date = Settings::get('default_invoice_due_date');
                        $default_due_date = empty($default_due_date) ? 0 : now()->addDays($default_due_date)->timestamp;

                        $partial_payment = array(
                            'unique_invoice_id' => $record['unique_id'],
                            'is_percentage' => 1,
                            'due_date' => $default_due_date,
                            'unique_id' => $this->ci->ppm->_generate_unique_id(),
                            'key' => $i,
                            'improved' => 1,
                            'is_paid' => 0,
                            'amount' => 100,
                            'payment_date' => 0,
                            'payment_gross' => 0,
                            'gateway_surcharge' => 0,
                            'transaction_fee' => 0,
                            'payment_status' => "",
                            'payment_method' => "",
                            'payment_type' => '',
                            'notes' => '',
                            'item_name' => '',
                            'payer_status' => '',
                        );

                        $this->db->insert('partial_payments', $partial_payment);
                    }
                }

                foreach (array_keys($record) as $field) {
                    if (substr($field, 0, strlen("item_")) == "item_" || substr($field, 0, strlen("payment_")) == "payment_") {
                        unset($record[$field]);
                    }
                }

                break;
            case 'clients':
                $this->process_date($record['created']);
                $record['created'] = date("Y-m-d H:i:s", $record['created']);
                $record['modified'] = date("Y-m-d H:i:s");
                $record['unique_id'] = $this->ci->clients_m->_generate_unique_id();
                break;
            case 'projects':
                $this->process_client($record['client_id']);
                $this->process_date($record['date_entered']);
                $this->process_date($record['due_date'], false);
                $this->process_number($record['rate']);
                $this->process_hours($record['projected_hours']);
                $record['unique_id'] = $this->ci->project_m->_generate_unique_id();
                $this->process_boolean($record['completed']);
                $this->process_boolean($record['is_viewable']);
                $this->process_boolean($record['is_archived']);
                $record['owner_id'] = current_user();
                $this->process_currency($record);
                break;
            case 'expenses':
                $record['owner_id'] = current_user();
                $this->process_supplier($record["supplier_id"]);
                $this->process_category($record["category_id"]);
                $this->process_project_id($record["project_id"]);

                if (!empty($record["due_date"])) {
                    $this->process_date($record["due_date"], false);
                    $record["due_date"] = carbonstamp($record["due_date"])->toDateTimeString();
                } else {
                    $record["due_date"] = null;
                }

                $this->process_number($record['rate']);

                if (!empty($record["receipt"])) {
                    # We know it's a valid URL because it was validated before, so let's download it:
                    $files = [];
                    $files[urldecode(basename($record["receipt"]))] = get_url_contents($record["receipt"]);
                    $buffer = pancake_upload($files, null, "expenses");

                    if ($buffer and is_array($buffer)) {
                        $buffer = reset($buffer);
                        $record["receipt"] = $buffer['folder_name'].$buffer['real_name'];
                    } else {
                        $record["receipt"] = "";
                    }
                }

                $record["payment_details"] = "";
                break;
            case 'time_entries':
                $this->process_client($record['client_id']);
                $this->process_project_id($record['project_id'], $record['client_id']);
                if ($record['project_id'] > 0) {
                    $record['client_id'] = (int) array_reset($this->db->select("client_id")->where("id", $record['project_id'])->get("projects")->row_array());
                }

                $this->process_task($record['task_id'], $record['client_id'], $record['project_id']);

                if ($record['project_id'] == 0) {
                    $record['project_id'] = $this->ci->project_task_m->getProjectIdById($record['task_id']);
                }

                $this->process_existing_record($record['user_id'], 'user_m');
                $this->process_date($record['date']);

                if (empty($record['start_time']) or empty($record['end_time'])) {
                    $this->process_hours($record['hours']);
                    $this->project_time_m->insert_hours($record['project_id'], $record['date'], $record['hours'], $record['task_id'], $record['note'], "08:00", $record['user_id']);
                } else {
                    $this->process_time($record['start_time']);
                    $this->process_time($record['end_time']);
                    $record['minutes'] = (strtotime($record['end_time']) - strtotime($record['start_time'])) / 60;
                    $this->project_time_m->insert(array(
                        'project_id' => $record['project_id'],
                        'start_time' => $record['start_time'],
                        'end_time' => $record['end_time'],
                        'date' => $record['date'],
                        'note' => $record['note'],
                        'task_id' => $record['task_id'],
                        'user_id' => $record['user_id'],
                        'minutes' => $record['minutes'],
                    ));
                }
                break;
            case 'tasks':
                $this->process_existing_record($record['project_id'], 'project_m');
                $result = $this->ci->project_milestone_m->search($record['milestone_id'], $record['project_id']);
                $record['milestone_id'] = (!isset($result[0]) or $result[0]['levenshtein'] > 0) ? 0 : $result[0]['id'];
                $this->process_existing_record($record['parent_id'], 'project_task_m');
                $this->process_number($record['rate']);
                $this->process_hours($record['projected_hours']);
                $this->process_date($record['due_date']);
                $this->process_boolean($record['completed']);
                $this->process_boolean($record['is_viewable']);
                $this->process_existing_record($record['status_id'], 'project_task_statuses_m');
                $this->process_existing_record($record['assigned_user_id'], 'user_m');
                $record['owner_id'] = current_user();
                break;
            case 'users':
                $additional_data = array(
                    'first_name' => $record['first_name'],
                    'last_name' => $record['last_name'],
                    'company' => $record['company'],
                    'phone' => $record['phone'],
                );

                $this->ion_auth->register($record['username'], $record['password'], $record['email'], $additional_data, $this->ci->user_m->getDefaultGroupName());
                break;
        }
    }

    function import($records, $import_type) {

        # Validate everything before importing.
        $records = $this->validate_records($records, $import_type);

        if (!$records) {
            return false;
        }

        # Search for duplicates
        $duplicate_count = 0;

        foreach (array_keys($records) as $key) {
            switch ($import_type) {
                case 'invoices':

                    break;
                case 'estimates':

                    break;
                case 'credit_notes':

                    break;
                case 'clients':
                    if ($this->ci->clients_m->find_client($records[$key]['company'], $records[$key]['first_name'], $records[$key]['last_name'])) {
                        unset($records[$key]);
                        $duplicate_count++;
                    }
                    break;
                case 'projects':

                    break;
                case 'tasks':
                    break;
                case 'time_entries':
                    break;
                case 'users':
                    if ($this->ci->user_m->existsByUsername($records[$key]['username'])) {
                        unset($records[$key]);
                        $duplicate_count++;
                    }
                    break;
            }
        }

        # Process fields for importing
        foreach (array_keys($records) as $key) {
            $this->process($records[$key], $import_type);
        }

        # Store Records
        $table = $this->_map_item_type_table($import_type);
        if (count($records) > 0 and !empty($table)) {

            if ($import_type == "clients") {
                $records_without_balance = array();
                $records_with_balance = array();

                foreach ($records as $record) {
                    if ($record['credit_balance'] > 0) {
                        $records_with_balance[] = $record;
                    } else {
                        unset($record['credit_balance']);
                        $records_without_balance[] = $record;
                    }
                }

                if (count($records_without_balance)) {
                    if (!$this->db->insert_batch($table, $records_without_balance)) {
                        return false;
                    }
                }

                if (count($records_with_balance)) {
                    foreach ($records_with_balance as $record) {
                        $balance = $record['credit_balance'];
                        unset($record['credit_balance']);
                        $this->db->insert($table, $record);
                        $client_id = $this->db->insert_id();
                        $this->clients_credit_alterations_m->add($client_id, $balance);
                    }
                }

            } else {
                if (!$this->db->insert_batch($table, $records)) {
                    return false;
                }
            }

            if ($table == "invoices") {
                # Run the fixInvoiceRecord().
                foreach ($records as $record) {
                    $this->invoice_m->fixInvoiceRecord($record["unique_id"]);
                }
            }
        }

        return array(
            'count' => count($records),
            'duplicates' => $duplicate_count,
        );
    }

    function match_fields($pancake_fields, $import_fields) {
        $max_matched_item = 3; # Show a minimum of 3 items by default.
        $max_matched_payment = 1;
        $field_mapping = [];

        foreach ($pancake_fields as $field => $label) {
            foreach ($import_fields as $import_field) {
                if ($this->match_field($label, $import_field)) {
                    $field_mapping[$import_field] = $field;

                    $search = "item_";
                    if (substr($field, 0, strlen($search)) == $search) {
                        $max_matched_item = max($max_matched_item, array_reset(explode("_", substr($field, strlen($search)))));
                    }

                    $search = "payment_";
                    if (substr($field, 0, strlen($search)) == $search) {
                        $max_matched_payment = max($max_matched_payment, array_reset(explode("_", substr($field, strlen($search)))));
                    }
                }
            }
        }

        return [
            "mapping" => $field_mapping,
            "payments_to_show" => $max_matched_payment,
            "items_to_show" => $max_matched_item,
        ];
    }

    function match_field($expected_field, $actual_field) {
        $expected_field_slug = url_title(humanize($expected_field), "-", true);
        $actual_field_slug = url_title(humanize($actual_field), "-", true);
        return ($expected_field_slug == $actual_field_slug);
    }

    function _map_item_type_table($import_type) {
        switch ($import_type) {
            case 'estimates':
                return 'invoices';
            case 'credit_notes':
                return 'invoices';
            case 'time_entries':
                return '';
            case 'users':
                return '';
            case 'tasks':
                return 'project_tasks';
            case 'expenses':
                return 'project_expenses';
        }

        return $import_type;
    }

}