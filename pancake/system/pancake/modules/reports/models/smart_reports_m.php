<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2015, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 4.7
 */
// ------------------------------------------------------------------------

/**
 * The Smart Reports Model
 *
 * @subpackage	Models
 * @category	Reports
 */
class Smart_reports_m extends Pancake_Model {

    public $reports;
    public $payments;
    public $invoices;
    public $expenses;

    function __construct() {
        parent::__construct();

        $this->reports = array(
            'unpaid_invoices' => __('invoices:unpaid'),
            'payments' => __('reports:payments'),
            'overdue_invoices' => __('invoices:overdue'),
            'invoices' => __('global:invoices'),
            'invoices_per_status_pie' => __('global:invoices'),
            'expenses' => __('expenses:expenses'),
            'payments_per_method' => __('reports:payments'),
        );

        $this->load->model("invoices/invoice_m");
        $this->load->model("invoices/partial_payments_m", "ppm");
        $this->load->model("projects/project_expense_m");
        $this->cache_invoices();
        $this->cache_payments();
        $this->cache_expenses();
    }

    function cache_invoices() {
        $per_page = 250;
        $data = array('include_totals' => true, 'return_object' => false, 'per_page' => $per_page, 'offset' => 0);
        $count = $per_page;
        while ($count == $per_page) {
            $invoices = $this->invoice_m->flexible_get_all($data);
            foreach ($invoices as $record) {
                $this->invoices[$record['unique_id']] = array(
                    'unique_id' => $record['unique_id'],
                    'invoice_number' => $record['invoice_number'],
                    'currency_id' => $record['currency_id'],
                    'due_date' => $record['due_date'],
                    'payment_date' => $record['payment_date'],
                    'client' => $record['client_id'],
                    'total_with_tax' => isset($record['total']) ? $record['total'] : $record['amount'],
                    'total_without_tax' => $record['amount'],
                    'total_collected' => $record['paid_amount'],
                    'taxes' => isset($record['taxes']) ? $record['taxes'] : array(),
                    'collected_taxes' => isset($record['collected_taxes']) ? $record['collected_taxes'] : array(),
                    'fees' => 0
                );
            }
            $count = count($invoices);
            $data['offset'] += $count;
        }
    }

    function cache_payments() {
        $config = array(
            "paid" => true
        );

        $return = array();
        $invoice_ids = array();
        $i = 0;
        $this->db->order_by("partial_payments.payment_date", "asc");
        $this->db->where("partial_payments.payment_method !=", "credit-balance");
        $rows = $this->ppm->flexible_get_all($config);

        $client_ids = array_map(function($row) {
            return $row["client_id"];
        }, $rows);

        foreach ($rows as $row) {
            if (!isset($invoice_ids[$row['unique_id']])) {
                $invoice_ids[$row['unique_id']] = array();
            }

            $invoice_total = $this->ppm->getInvoiceTotalAmount($row['unique_id'], $client_ids);
            if ($invoice_total != 0) {
                $payment_percentage = $row["billable_amount"] / $invoice_total;
            } else {
                $payment_percentage = 100;
            }
            $invoice_ids[$row['unique_id']][] = $i;

            $return[$i] = array(
                "invoice" => $row['unique_id'],
                "payment_date" => $row['payment_date'],
                "payment_method" => $row['payment_method'],
                # Total Without Tax == Paid Amount
                "total_without_tax" => $row["billable_amount"],
                "transaction_fee" => $row['transaction_fee'],
                "currency_id" => $row['currency_id'],
                "unique_id" => $row['unique_id'],
                "taxes" => array(),
                "percentage" => $payment_percentage,
                "client_id" => $row['client_id'],
            );

            $i++;
        }

        foreach ($invoice_ids as $unique_id => $keys) {
            if (isset($this->invoices[$unique_id])) {
                foreach ($keys as $key) {
                    # Add transaction fee to invoice record.
                    $this->invoices[$unique_id]['fees'] += $return[$key]["transaction_fee"];
                }

                foreach ($this->invoices[$unique_id]['taxes'] as $tax_id => $amount) {
                    foreach ($keys as $key) {
                        if (!isset($return[$key]["taxes"][$tax_id])) {
                            $return[$key]["taxes"][$tax_id] = $return[$key]["percentage"] * $amount;
                        }
                    }
                }
            }
        }

        return $return;
    }

    function cache_expenses() {
        
    }

}
