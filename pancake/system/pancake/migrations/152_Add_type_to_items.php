<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_type_to_items extends CI_Migration
{
    public function up()
	{
		add_column('items', 'type', 'varchar', 128, null, true);
		add_column('invoice_rows', 'type', 'varchar', 128, null, true);
    }

    public function down()
	{

    }
}