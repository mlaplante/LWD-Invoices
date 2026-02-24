<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_user_background extends CI_Migration
{
    public function up()
	{
		add_column('meta', 'custom_background', 'varchar', 255, null, true, 'phone');
		add_column('project_tasks', 'assigned_user_id', 'int', 10, null, true);
		add_column('project_tasks', 'parent_id', 'int', 10, null, true);
		add_column('projects', 'is_archived', 'tinyint', 1, 0);
    }

    public function down()
	{

    }
}