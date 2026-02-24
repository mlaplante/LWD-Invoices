<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Track_invoiced_hours extends CI_Migration {
    
	public function up()
	{
		add_column('project_times', 'invoice_item_id', 'int', 11, 0);	
    }
    
	public function down()
	{
		$this->dbforge->remove_column('project_times', 'invoice_item_id');
    }
}