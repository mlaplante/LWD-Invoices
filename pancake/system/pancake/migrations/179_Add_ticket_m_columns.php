<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_ticket_m_columns extends CI_Migration{
	
	public function up(){
		add_column('tickets', 'is_billable', 'tinyint', 1, 0);
		add_column('tickets', 'is_paid', 'tinyint', 1, 0);
		add_column('tickets', 'invoice_id', 'int', 11, 0);

	}

	public function down(){
		drop_column('tickets', 'is_billable');
		drop_column('tickets', 'is_paid');
		drop_column('tickets', 'invoice_id');
	}
}