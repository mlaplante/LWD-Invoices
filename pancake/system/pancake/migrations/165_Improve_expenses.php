<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Improve_expenses extends CI_Migration
{
    public function up()
    {
	
	// add_column($table, $name, $type, $constraint = null, $default = '', $null = FALSE, $after_field = '')
	
        add_column('project_expenses', 'supplier_id', 'int', 11, NULL, TRUE, 'project_id');
		
		add_column('project_expenses', 'category_id', 'int', 11, NULL, TRUE, 'project_id');
				
		add_column('project_expenses', 'due_date', 'date', NULL, NULL, TRUE, 'project_id');
		
		add_column('project_expenses', 'invoice_number', 'VARCHAR', 255, NULL, TRUE, 'project_id');
		
		add_column('project_expenses', 'invoice_id', 'int', 11, NULL, TRUE, 'project_id');
		
		add_column('project_expenses', 'payment_source_id', 'int', 11, NULL, TRUE, 'project_id');
		
		add_column('project_expenses', 'payment_details', 'text', NULL, TRUE, 'project_id');
    }

    public function down()
    {
		drop_column('project_expenses', 'supplier_id');

		drop_column('project_expenses', 'category_id');

		drop_column('project_expenses', 'amount');

		drop_column('project_expenses', 'due_date');

		drop_column('project_expenses', 'invoice_number');

		drop_column('project_expenses', 'invoice_id');

		drop_column('project_expenses', 'payment_source_id');

		drop_column('project_expenses', 'payment_details');
    }
}