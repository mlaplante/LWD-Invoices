<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_default_invoice_due_date extends CI_Migration {
    function up() {
        Settings::create('default_invoice_due_date', '');
    }
    
    function down() {
        Settings::delete('default_invoice_due_date');
    }
}