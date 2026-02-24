<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_no_partial_payments extends CI_Migration {
    function up() {
        $this->load->model('invoices/invoice_m');
        $this->invoice_m->fixNoPartialPayments();
    }
    
    function down() {
        
    }
}