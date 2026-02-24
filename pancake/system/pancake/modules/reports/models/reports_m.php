<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2011, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 2.2
 */
// ------------------------------------------------------------------------

/**
 * The Reports Model
 *
 * @subpackage	Models
 * @category	Reports
 */
class Reports_m extends Pancake_Model {

    public $reports;
    public $cached_payments_per_method = array();

    function __construct() {
        parent::__construct();

        $this->reports = array(
            'unpaid_invoices' => __('invoices:unpaid'),
            'payments' => __('reports:payments'),
            'overdue_invoices' => __('invoices:overdue'),
            'invoices' => __('global:invoices'),
            'invoices_per_status_pie' => __('global:invoices'),
            'archived_invoices' => __("invoices:invoices_archived"),
            'expenses' => __('expenses:expenses'),
            'payments_per_method' => __('reports:payments'),
        );

        \Pancake\Reports\Reports::registerReport("\\Pancake\\Reports\\ExpensesReport");
    }

    function totals($from = 0, $to = 0, $client_id = NULL, $business_identity_id = null, $is_archived = false) {
        static $totals = [
            "archived" => null,
            "not_archived" => null
        ];

        $key = $is_archived ? "archived" : "not_archived";

        if ($totals[$key] === null) {
            $totals[$key] = array();

            $this->db->join("invoices", "invoices.unique_id = unique_invoice_id");
            $this->db->where("type", "DETAILED");
            $this->db->where("is_archived", $is_archived);
            if ($client_id > 0) {
                $this->db->where("invoices.client_id", $client_id);
            }
            if ($business_identity_id > 0) {
                $this->db->where("business_identity", $business_identity_id);
            }
            if ($from > 0) {
                $this->db->where("invoices.date_entered >=", $from);
            }
            if ($to > 0) {
                $this->db->where("invoices.date_entered <=", $to);
            }
            $this->db->join('clients', 'clients.id = client_id');
            $this->db->select("unique_invoice_id");
            $this->db->distinct();
            $unique_ids = array_map(function($row) {
                return $row['unique_invoice_id'];
            }, $this->db->get("partial_payments")->result_array());

            $this->load->model("invoices/partial_payments_m", "ppm");
            $totals[$key] = $this->ppm->get_totals($unique_ids);

            $buffer = $totals[$key]['unpaid_totals_per_client'];
            $formatted = array();
            foreach ($buffer as $client_id => $total) {
                if ($client_id != "total" && $total > 0) {
                    $formatted[client_name($client_id)] = $total;
                }
            }
            $totals[$key]['unpaid_totals_per_client'] = $formatted;

            $buffer = $totals[$key]['overdue_totals_per_client'];
            $formatted = array();
            foreach ($buffer as $client_id => $total) {
                if ($client_id != "total" && $total > 0) {
                    $formatted[client_name($client_id)] = $total;
                }
            }
            $totals[$key]['overdue_totals_per_client'] = $formatted;

            $buffer = $totals[$key]['totals_per_client'];
            $formatted = array();
            foreach ($buffer as $client_id => $total) {
                if ($client_id != "total" && $total > 0) {
                    $formatted[client_name($client_id)] = $total;
                }
            }
            $totals[$key]['totals_per_client'] = $formatted;

            $totals[$key]['totals_per_is_paid'][__("global:paid")] = $totals[$key]['totals_per_is_paid'][1];
            $totals[$key]['totals_per_is_paid'][__("global:unpaid")] = $totals[$key]['totals_per_is_paid'][0];

            unset($totals[$key]['totals_per_is_paid'][0]);
            unset($totals[$key]['totals_per_is_paid'][1]);
        }

        return $totals[$key];
    }

    function getOverviews($from = 0, $to = 0, $client_id = NULL, $business_identity_id = null) {
        $return = array();
        foreach (array_keys($this->reports) as $report) {
            $return[$report] = $this->load->view('reports/overview', $this->get($report, $from, $to, $client_id, $business_identity_id), true);
        }
        return $return;
    }

    function generateReportString($from = 0, $to = 0, $client = 0, $business = 0) {
        $report_data = [];
        foreach (["from", "to", "client", "business"] as $var) {
            $value = $$var;

            if ($value > 0) {
                $report_data[] = "$var;$value";
            }
        }

        return implode("-", $report_data);
    }

    function processReportString($string) {
        # Support older links, which used a colon to separate values.
        $string = str_replace(":", ";", $string);

        $string = explode('-', $string);
        $data = [];
        foreach ($string as $item) {
            $item = explode(";", $item);
            if (isset($item[1])) {
                $data[$item[0]] = $item[1];
            }
        }

        if (!isset($data['from']) || $data['from'] == 0) {
            $data['from'] = Settings::fiscal_year_start()->timestamp;
        }

        if (!isset($data['to']) || $data['to'] == 0) {
            # Get the end of the day.
            $data['to'] = now()->endOfDay()->timestamp;
        }

        if (!isset($data['client'])) {
            $data['client'] = null;
        }

        if (!isset($data['business'])) {
            $data['business'] = null;
        }

        # If there's only one business identity, we want the data for all identities.
        # This fixes the problem whereby expenses with no associated client (i.e. business expenses) were not included,
        # because they didn't have a business identity, and the "all identities" option doesn't show up when there's only 1 identity,
        # so there was no way to show business expenses.
        if ($this->business_identities_m->count_all() === 1) {
            $data['business'] = null;
        }

        return $data;
    }

    function getDefaultFrom(int $from): int
    {
        return ($from > 0 ? $from : Settings::fiscal_year_start()->timestamp);
    }

    function getDefaultTo($to) {
        return ($to > 0 ? $to : now()->timestamp);
    }

    function _process_due_date($input) {
        return format_date($input);
    }

    function _process_amount($input) {
        return Currency::format($input);
    }

    function _process_billable_amount($input) {
        return Currency::format($input);
    }

    function _process_money_amount($input) {
        return Currency::format($input);
    }

    function _process_unpaid_amount($input) {
        return Currency::format($input);
    }

    function _process_paid_amount($input) {
        return Currency::format($input);
    }

    function _process_tax_collected($input) {
        return Currency::format($input);
    }

    private function _expense_report($from, $to, $client_id, $business_identity_id = null, $is_full = true) {

        $fields = array(
            "name" => __("global:name"),
            "category" => __("expenses:category"),
            "supplier" => __("expenses:supplier"),
            "client" => __("global:client"),
            "project" => __('global:project'),
            "due_date" => __("projects:expense_date"),
            "is_billed" => __("global:is_billed"),
            "unbilled_amount" => __("global:unbilled_amount"),
            "billed_amount" => __("global:billed_amount"),
            "amount" => __("expenses:amount"),
        );

        $amount = 0;
        $unbilled_amount = 0;
        $billed_amount = 0;

        $this->load->model("projects/project_expense_m");
        $records = $this->project_expense_m->get_for_report($from, $to, $client_id, $business_identity_id);

        foreach ($records as $record) {
            $amount += Currency::convert($record['amount'], Currency::code($record['currency_id']), Settings::get('currency'));
            $unbilled_amount += Currency::convert($record['unbilled_amount'], Currency::code($record['currency_id']), Settings::get('currency'));
            $billed_amount += Currency::convert($record['billed_amount'], Currency::code($record['currency_id']), Settings::get('currency'));
        }

        $totals = array(
            "amount" => $amount,
            "unbilled_amount" => $unbilled_amount,
            "billed_amount" => $billed_amount,
        );

        $reportString = $this->generateReportString($from, $to, $client_id, $business_identity_id);

        $data = array(
            'title' => $this->reports["expenses"],
            'report' => "expenses",
            'from' => $from,
            'to' => $to,
            'formatted_from' => format_date($from),
            'formatted_to' => format_date($to),
            'report_url' => site_url("reports/expenses/view/$reportString"),
            'report_url_pdf' => site_url("reports/expenses/pdf/$reportString"),
            'report_url_csv' => site_url("reports/expenses/csv/$reportString"),
            'fields' => $fields,
            'records' => $records,
            'chart_totals' => array(),
        );

        $data['verb'] = __("reports:verb_created");

        if ($is_full) {
            $data['taxes'] = array();
            $data['totals'] = $totals;
        } else {

            $unformatted_total = reset($totals);
            foreach ($totals as $field => $amount) {
                $totals[$field] = Currency::format($amount);
            }

            $data["report_total"] = $unformatted_total;
            $data['field_totals'] = $totals;
            $data["formatted_total"] = reset($data['field_totals']);

            $clients = get_dropdown('clients', 'id', "client_name");

            $client_totals = array();
            $client_totals_fields = array_keys($data['field_totals']);
            foreach ($records as $row) {
                foreach ($client_totals_fields as $field) {
                    if (!isset($clients[$row['client_id']])) {
                        # Expense belongs to a project that no longer exists.
                        $client = __("global:na");
                    } else {
                        $client = $clients[$row['client_id']];
                    }

                    if (!isset($client_totals[$field])) {
                        $client_totals[$field] = array();
                    }

                    if (!isset($client_totals[$field][$client])) {
                        $client_totals[$field][$client] = 0;
                    }

                    $client_totals[$field][$client] += $row[$field];
                }
            }

            $data['client_totals'] = $client_totals;
            $data['chart_type'] = 'pie';
            $data['per'] = __('reports:perclient');
            $data['chart_totals'] = reset($client_totals);
        }

        return $data;
    }

    private function _payments_report($from, $to, $client_id, $business_identity_id = null, $is_full = true) {

        $fields = array(
            "invoice_number" => __("global:invoice"),
            "client" => __("global:client"),
            "payment_date" => __('partial:paymentdate'),
            "payment_method" => __('partial:paymentmethod'),
            "total_without_tax" => __("reports:amount_paid"),
            'collected_taxes' => '{tax}',
            "transaction_fee" => __("reports:fees_paid"),
        );

        $total_without_tax = 0;
        $transaction_fee = 0;
        $taxes = array();

        $this->load->model("invoices/invoice_m");
        $this->load->model("invoices/partial_payments_m");
        $records = $this->partial_payments_m->get_for_report($from, $to, $client_id, $business_identity_id, $is_full);

        $totals = array(
            "total_without_tax" => 0,
            "transaction_fee" => 0,
            "collected_taxes" => array(),
        );

        foreach ($records as $record) {
            $total_without_tax += Currency::convert($record['total_without_tax'], Currency::code($record['currency_id']), Settings::get('currency'));
            $transaction_fee += Currency::convert($record['transaction_fee'], Currency::code($record['currency_id']), Settings::get('currency'));

            foreach ($record['taxes'] as $tax_id => $collected) {
                if (!isset($totals['collected_taxes'][$tax_id])) {
                    $totals['collected_taxes'][$tax_id] = array(
                        'uncollected' => "n/a",
                        'collected' => 0,
                        'total' => "n/a"
                    );

                    $taxes[$tax_id] = Settings::tax($tax_id);
                    $taxes[$tax_id] = $taxes[$tax_id]['name'];
                }

                $totals['collected_taxes'][$tax_id]["collected"] += $collected;
            }
        }

        $totals["total_without_tax"] = $total_without_tax;
        $totals["transaction_fee"] = $transaction_fee;

        $reportString = $this->generateReportString($from, $to, $client_id, $business_identity_id);

        $data = array(
            'title' => $this->reports["payments"],
            'report' => "payments",
            'from' => $from,
            'to' => $to,
            'formatted_from' => format_date($from),
            'formatted_to' => format_date($to),
            'report_url' => site_url("reports/payments/view/$reportString"),
            'report_url_pdf' => site_url("reports/payments/pdf/$reportString"),
            'report_url_csv' => site_url("reports/payments/csv/$reportString"),
            'fields' => $fields,
            'records' => $records,
            'chart_totals' => array(),
        );

        $data['verb'] = __("reports:verb_paid");

        if ($is_full) {
            $data['taxes'] = $taxes;
            $data['totals'] = $totals;
        } else {
            unset($totals['collected_taxes']);

            $unformatted_total = reset($totals);
            foreach ($totals as $field => $amount) {
                $totals[$field] = Currency::format($amount);
            }

            $data["report_total"] = $unformatted_total;
            $data['field_totals'] = $totals;
            $data["formatted_total"] = reset($data['field_totals']);

            $clients = get_dropdown('clients', 'id', "client_name");

            $client_totals = array();
            $payment_method_totals = array();
            
            $client_totals_fields = array_keys($data['field_totals']);
            require_once APPPATH . 'modules/gateways/gateway.php';
            $gateways = Gateway::get_gateways();
            
            foreach ($records as $row) {
                
                $payment_method = isset($gateways[$row["payment_method"]]) ? $gateways[$row["payment_method"]]['title'] : __('global:na');;
                
                if (!isset($payment_method_totals[$payment_method])) {
                    $payment_method_totals[$payment_method] = 0;
                }
                
                $payment_method_totals[$payment_method] += Currency::convert($row['total_without_tax'], Currency::code($row['currency_id']), Settings::get('currency'));
                
                foreach ($client_totals_fields as $field) {
                    if (!isset($clients[$row['client_id']])) {
                        # Payment belongs to a project that no longer exists.
                        $client = __("global:na");
                    } else {
                        $client = $clients[$row['client_id']];
                    }

                    if (!isset($client_totals[$field])) {
                        $client_totals[$field] = array();
                    }

                    if (!isset($client_totals[$field][$client])) {
                        $client_totals[$field][$client] = 0;
                    }

                    $client_totals[$field][$client] += $row[$field];
                }
            }

            $data['client_totals'] = $client_totals;
            $data['chart_type'] = 'pie';
            $data['per'] = __('reports:perclient');
            $data['chart_totals'] = reset($client_totals);
            
            $this->cached_payments_per_method = array(
                'title' => __("reports:payments"),
                'report' => 'payments_per_method',
                'from' => $data['from'],
                'to' => $data['to'],
                'formatted_from' => $data['formatted_from'],
                'formatted_to' => $data['formatted_to'],
                'report_url' => site_url("reports/payments_per_method/view/$reportString"),
                'report_url_pdf' => site_url("reports/payments_per_method/pdf/$reportString"),
                'report_url_csv' => site_url("reports/payments_per_method/csv/$reportString"),
                'fields' => array(),
                'records' => array(),
                'chart_totals' => $payment_method_totals,
                'report_total' => $data['report_total'],
                'field_totals' => $data['field_totals'],
                'verb' => $data['verb'],
                'formatted_total' => $data['formatted_total'],
                'client_totals' => $data['client_totals'],
                'chart_type' => 'pie',
                'per' => __("reports:per_payment_method"),
            );
        }

        return $data;
    }

    private function _payments_per_method_report($from, $to, $client_id, $business_identity_id = null, $is_full = true) {
        if ($is_full) {
            $fields = array(
                "payment_method" => __('partial:paymentmethod'),
                "total_without_tax" => __("reports:amount_paid"),
                'collected_taxes' => '{tax}',
                "transaction_fee" => __("reports:fees_paid"),
            );

            $total_without_tax = 0;
            $transaction_fee = 0;
            $taxes = array();

            $this->load->model("invoices/invoice_m");
            $this->load->model("invoices/partial_payments_m");
            $records = $this->partial_payments_m->get_for_report($from, $to, $client_id, $business_identity_id, $is_full);

            $totals = array(
                "total_without_tax" => 0,
                "transaction_fee" => 0,
                "collected_taxes" => array(),
            );

            foreach ($records as $record) {
                $total_without_tax += Currency::convert($record['total_without_tax'], Currency::code($record['currency_id']), Settings::get('currency'));
                $transaction_fee += Currency::convert($record['transaction_fee'], Currency::code($record['currency_id']), Settings::get('currency'));

                foreach ($record['taxes'] as $tax_id => $collected) {
                    $collected = Currency::convert($collected, Currency::code($record['currency_id']), Settings::get('currency'));
                    if (!isset($totals['collected_taxes'][$tax_id])) {
                        $totals['collected_taxes'][$tax_id] = array(
                            'uncollected' => "n/a",
                            'collected' => 0,
                            'total' => "n/a"
                        );

                        $taxes[$tax_id] = Settings::tax($tax_id);
                        $taxes[$tax_id] = $taxes[$tax_id]['name'];
                    }

                    $totals['collected_taxes'][$tax_id]["collected"] += $collected;
                }
            }

            $totals["total_without_tax"] = $total_without_tax;
            $totals["transaction_fee"] = $transaction_fee;

            $new_records = array();
            foreach ($records as $record) {
                if (!isset($new_records[$record['payment_method']])) {
                    $new_records[$record['payment_method']] = array(
                        'payment_method' => $record['payment_method'],
                        'total_without_tax' => 0,
                        'collected_taxes' => array(),
                        'transaction_fee' => 0,
                        'currency_id' => Settings::get('currency'),
                    );
                }

                foreach ($record['taxes'] as $tax_id => $collected) {
                    $collected = Currency::convert($collected, Currency::code($record['currency_id']), Settings::get('currency'));

                    if (!isset($new_records[$record['payment_method']]['collected_taxes'][$tax_id])) {
                        $new_records[$record['payment_method']]['collected_taxes'][$tax_id] = 0;
                    }

                    $new_records[$record['payment_method']]['collected_taxes'][$tax_id] += $collected;
                }

                $total_without_tax = Currency::convert($record['total_without_tax'], Currency::code($record['currency_id']), Settings::get('currency'));
                $transaction_fee = Currency::convert($record['transaction_fee'], Currency::code($record['currency_id']), Settings::get('currency'));

                $new_records[$record['payment_method']]['taxes'] = $new_records[$record['payment_method']]['collected_taxes'];
                $new_records[$record['payment_method']]['total_without_tax'] += $total_without_tax;
                $new_records[$record['payment_method']]['transaction_fee'] += $transaction_fee;
            }

            $reportString = $this->generateReportString($from, $to, $client_id, $business_identity_id);

            $data = array(
                'title' => $this->reports["payments_per_method"],
                'report' => "payments_per_method",
                'from' => $from,
                'to' => $to,
                'formatted_from' => format_date($from),
                'formatted_to' => format_date($to),
                'report_url' => site_url("reports/payments_per_method/view/$reportString"),
                'report_url_pdf' => site_url("reports/payments_per_method/pdf/$reportString"),
                'report_url_csv' => site_url("reports/payments_per_method/csv/$reportString"),
                'fields' => $fields,
                'records' => $new_records,
                'chart_totals' => array(),
                'verb' => __("reports:verb_paid"),
            );
            $data['taxes'] = $taxes;
            $data['totals'] = $totals;

            return $data;
        } else {
            return $this->cached_payments_per_method;
        }

        return $data;
    }

    function get_full($report, $from = 0, $to = 0, $client_id = NULL, $business_identity_id = null) {
        $from = carbonstamp($from)->startOfDay()->timestamp;
        $to = carbonstamp($to)->endOfDay()->timestamp;

        if ($report == 'expenses') {
            return $this->_expense_report($from, $to, $client_id, $business_identity_id);
        } elseif ($report == 'payments') {
            return $this->_payments_report($from, $to, $client_id, $business_identity_id);
        } elseif ($report == 'payments_per_method') {
            return $this->_payments_per_method_report($from, $to, $client_id, $business_identity_id);
        }

        $taxes = array();

        if ($client_id == 0) {
            $client_id = NULL;
        }

        $CI = &get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('invoices/partial_payments_m', 'ppm');

        $configs = array(
            'client_id' => $client_id,
            'business_identity_id' => $business_identity_id,
            'from' => $from,
            'to' => $to,
            'include_totals' => true,
            'include_partials' => true,
            'return_object' => false
        );

        if ($report == 'unpaid_invoices') {
            $configs['paid'] = false;
        }

        # Show archived if it's the archived report, otherwise don't.
        $configs['archived'] = ($report == 'archived_invoices');

        $records = $CI->invoice_m->flexible_get_all($configs);

        $totals = array(
            'total_with_tax' => 0,
            'total_without_tax' => 0,
            'total_collected' => 0,
            'taxes' => array(),
            'fees' => 0
        );

        foreach ($records as $key => &$record) {

            switch ($report) {
                case 'overdue_invoices':
                    if (!$record['overdue']) {
                        unset($records[$key]);
                        continue 2;
                    }
                    break;
                case 'paid_invoices':
                    if ($record['paid_amount'] == 0) {
                        unset($records[$key]);
                        continue 2;
                    }
                    break;
                case 'tax_collected':
                    if ($record['tax_collected'] == 0) {
                        unset($records[$key]);
                        continue 2;
                    }
                    break;
                case 'unpaid_invoices':
                    if ($record['unpaid_amount'] == 0) {
                        unset($records[$key]);
                        continue 2;
                    }
                    break;
            }

            $exchange_rate = $record['exchange_rate'];

            $record = array(
                'unique_id' => $record['unique_id'],
                'invoice_number' => $record['invoice_number'],
                'currency_id' => $record['currency_id'],
                'date_entered' => $record['date_entered'],
                'due_date' => $record['due_date'],
                'payment_date' => $record['payment_date'],
                'client' => $record['client_name'] . (empty($record['company']) ? '' : ' - ') . $record['company'],
                'total_with_tax' => isset($record['total']) ? $record['total'] : $record['amount'],
                'total_without_tax' => $record['amount'],
                'total_collected' => $record['paid_amount'],
                'total_taxes' => isset($record['taxes']) ? $record['taxes'] : array(),
                'taxes' => isset($record['collected_taxes']) ? $record['collected_taxes'] : array(),
                'fees' => $record['total_transaction_fees']
            );

            $totals['total_with_tax'] += $record['total_with_tax'] / $exchange_rate;
            $totals['total_without_tax'] += $record['total_without_tax'] / $exchange_rate;
            $totals['total_collected'] += $record['total_collected'] / $exchange_rate;
            $totals['fees'] += $record['fees'] / $exchange_rate;
            foreach ($record['taxes'] as $tax_id => $collected_tax) {
                if (!isset($totals['taxes'][$tax_id])) {
                    $totals['taxes'][$tax_id] = array(
                        'uncollected' => 0,
                        'collected' => 0,
                        'total' => 0
                    );

                    $taxes[$tax_id] = Settings::tax($tax_id);
                    $taxes[$tax_id] = $taxes[$tax_id]['name'];
                }

                $totals['taxes'][$tax_id]['collected'] += $collected_tax / $exchange_rate;
                $totals['taxes'][$tax_id]['total'] += $record['total_taxes'][$tax_id] / $exchange_rate;
                $totals['taxes'][$tax_id]['uncollected'] += ($record['total_taxes'][$tax_id] - $collected_tax) / $exchange_rate;
            }
        }

        $fields = array(
            'invoice_number' => __('invoices:number'),
            'date_entered' => __('invoices:date_entered'),
            'due_date' => __('projects:due_date'),
            'payment_date' => __('partial:paymentdate'),
            'client' => __('global:client'),
            'total_with_tax' => __('reports:total_with_tax'),
            'total_without_tax' => __('reports:total_without_tax'),
            'total_collected' => __('reports:total_collected'),
            'fees' => __('reports:fees_paid'),
            'taxes' => '{tax}',
        );

        $reportString = $this->generateReportString($from, $to, $client_id, $business_identity_id);

        return array(
            'title' => $this->reports[$report],
            'report' => $report,
            'from' => $from,
            'verb' => __("reports:verb_created"),
            'to' => $to,
            'taxes' => $taxes,
            'formatted_from' => format_date($from),
            'formatted_to' => format_date($to),
            'report_url' => site_url("reports/$report/view/$reportString"),
            'report_url_pdf' => site_url("reports/$report/pdf/$reportString"),
            'report_url_csv' => site_url("reports/$report/csv/$reportString"),
            'fields' => $fields,
            'records' => $records,
            'totals' => $totals
        );
    }

    function get($report, $from = 0, $to = 0, $client_id = NULL, $business_identity_id = null) {
        $from = carbonstamp($from)->startOfDay()->timestamp;
        $to = carbonstamp($to)->endOfDay()->timestamp;

        if ($report == 'expenses') {
            return $this->_expense_report($from, $to, $client_id, $business_identity_id, false);
        } elseif ($report == 'payments') {
            return $this->_payments_report($from, $to, $client_id, $business_identity_id, false);
        } elseif ($report == 'payments_per_method') {
            return $this->_payments_per_method_report($from, $to, $client_id, $business_identity_id, false);
        } else {
            $details = $this->totals($from, $to, $client_id, $business_identity_id, ($report == "archived_invoices"));

            switch ($report) {
                case 'unpaid_invoices':
                    $report_total = $details['unpaid_totals']['total'];
                    $formatted_total = Currency::format($report_total);
                    $totals = $details['unpaid_totals_per_client'];
                    break;
                case 'overdue_invoices':
                    $report_total = $details['overdue_totals']['total'];
                    $formatted_total = Currency::format($report_total);
                    $totals = $details['overdue_totals_per_client'];
                    break;
                case 'invoices':
                    $report_total = $details['totals']['total'];
                    $formatted_total = Currency::format($report_total);
                    $totals = $details['totals_per_client'];
                    break;
                case 'archived_invoices':
                    $report_total = $details['archived_totals']['total'];
                    $formatted_total = Currency::format($report_total);
                    $totals = $details['archived_totals_per_client'];
                    break;
                case 'invoices_per_status_pie':
                    $report_total = array_sum($details['totals_per_is_paid']);
                    $formatted_total = Currency::format($details['totals']['total']);
                    $totals = $details['totals_per_is_paid'];
                    break;
            }

            $reportString = $this->generateReportString($from, $to, $client_id, $business_identity_id);

            return array(
                'title' => $this->reports[$report],
                'report' => $report,
                'from' => $from,
                'to' => $to,
                'formatted_from' => format_date($from),
                'formatted_to' => format_date($to),
                'report_url' => site_url("reports/$report/view/$reportString"),
                'report_url_pdf' => site_url("reports/$report/pdf/$reportString"),
                'report_url_csv' => site_url("reports/$report/csv/$reportString"),
                'chart_totals' => $totals,
                'report_total' => $report_total,
                'verb' => __("reports:verb_created"),
                'formatted_total' => $formatted_total,
                'chart_type' => 'pie',
                'per' => __("reports:per_client"),
            );
        }
    }

}
