<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_sort_invoice_rows extends CI_Migration {

    public function up()
	{
        add_column('invoice_rows', 'sort', 'smallint', 4, 0);
    }

    public function down() {
        
    }

}