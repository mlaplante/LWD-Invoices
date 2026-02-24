<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_partial_payments extends CI_Migration {

    public function up() {
        add_column('invoices', 'send_x_days_before', 'int', 11, 7);
        add_column('invoice_rows', 'sort', 'smallint', 4, 0);
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('partial_payments') . " (
          `id` int(11) NOT NULL AUTO_INCREMENT,
          `unique_invoice_id` varchar(10) NOT NULL,
          `amount` float NOT NULL,
          `is_percentage` tinyint(1) NOT NULL,
          `due_date` int(11) NOT NULL,
          `notes` text NOT NULL,
          `txn_id` varchar(255) NOT NULL,
          `payment_gross` float NOT NULL,
          `item_name` varchar(255) NOT NULL,
          `is_paid` tinyint(1) NOT NULL,
          `payment_date` int(11) NOT NULL,
          `payment_type` varchar(255) NOT NULL,
          `payer_status` varchar(255) NOT NULL,
          `payment_status` varchar(255) NOT NULL,
          `unique_id` varchar(10) NOT NULL,
	  `transaction_fee` float NOT NULL,
          `payment_method` varchar(255) NOT NULL,
          `key` int(11) NOT NULL,
          PRIMARY KEY (`id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8;");

        $this->load->model('invoices/invoice_m');
        $this->load->model('invoices/partial_payments_m', 'ppm');

        $invoices = $this->db->select("invoices.unique_id, invoices.due_date, invoices.is_paid, invoices.payment_date, invoices.txn_id,
                IF(" . $this->db->dbprefix('invoices') . ".txn_id = '', IF(" . $this->db->dbprefix('invoices') . ".is_paid = 1, 'cash_m', ''), 'paypal_m') as gateway,
                IF(" . $this->db->dbprefix('invoices') . ".payment_status = '', IF(" . $this->db->dbprefix('invoices') . ".is_paid, 'Completed', ''), " . $this->db->dbprefix('invoices') . ".payment_status) as status", false)
                ->not_like('type', 'ESTIMATE')
                ->where('(SELECT COUNT(*) FROM ' . $this->db->dbprefix('partial_payments') . ' WHERE ' . $this->db->dbprefix('invoices') . '.unique_id = ' . $this->db->dbprefix('partial_payments') . '.unique_invoice_id) = 0', null, false)
                ->get('invoices')
                ->result_array();
        foreach ($invoices as $invoice) {
            # This invoice has no part payments, let's create one.
            $this->ppm->setPartialPayment($invoice['unique_id'], 1, 100, 1, (($invoice['due_date'] > 0) ? $invoice['due_date'] : 0), '');
            $this->ppm->setPartialPaymentDetails($invoice['unique_id'], 1, $invoice['payment_date'], $invoice['gateway'], $invoice['status'], $invoice['txn_id']);
        }
        return true;
    }

    public function down() {
        $this->dbforge->drop_table('partial_payments');
    }

}