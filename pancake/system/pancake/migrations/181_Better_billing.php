<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Better_billing extends CI_Migration {

    public function up() {
        add_column('invoices', 'project_id', 'int', '255', 0);
        add_column('invoices', 'status', 'varchar', '255', '');
        add_column('invoices', 'last_status_change', 'int', '255', 0);
        add_column('project_expenses', 'invoice_item_id', 'int', 255, 0);
        add_column('invoice_rows', 'item_type_table', 'varchar', '255', '');
        add_column('invoice_rows', 'item_type_id', 'int', '255', 0);
    }

    public function down() {
        
    }

}