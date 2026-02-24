<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_expense_receipts extends CI_Migration {

    function up() {
        add_column('project_expenses', 'receipt', 'varchar', 1024, '');
    }

    function down() {
        drop_column('project_expenses', 'receipt');
    }

}
