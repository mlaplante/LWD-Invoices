<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_invoice_records_again extends CI_Migration {

    public function up() {
        $this->load->model('invoices/invoice_m');
        $this->load->model('invoices/partial_payments_m', 'ppm');
        $invoices = $this->db->select('unique_id')->where('amount', 0)->get('invoices')->result_array();
        foreach ($invoices as $invoice) {
            $this->invoice_m->fixInvoiceRecord($invoice['unique_id']);
        }
    }

    public function down() {

    }

}