<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_expense_statuses extends CI_Migration
{
    public function up()
    {
        add_column('project_expenses_categories', 'status', 'varchar', 128, '', TRUE, 'notes');
		add_column('project_expenses_categories', 'deleted', 'tinyint', 1, '0', false, 'notes');
		add_column('project_expenses_suppliers', 'status', 'varchar', 128, '', TRUE, 'notes');
		add_column('project_expenses_suppliers', 'deleted', 'tinyint', 1, '0', false, 'notes');
    }

    public function down()
    {
		drop_column('project_expenses_categories', 'status');
		drop_column('project_expenses_categories', 'deleted');

		drop_column('project_expenses_suppliers', 'status');
		drop_column('project_expenses_suppliers', 'deleted');
   }
}