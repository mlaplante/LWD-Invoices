<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Improve_partial_payments extends CI_Migration {
    function up() {
        add_column('partial_payments', 'improved', 'int', 1, 0);
        $this->load->model('invoices/invoice_m');
        $this->invoice_m->improvePartialPayments();
        $this->db->query("ALTER TABLE ".$this->db->dbprefix('partial_payments')." CHANGE  `improved`  `improved` INT( 1 ) NOT NULL DEFAULT  '1'");
    }
    
    function down() {
        
    }
}