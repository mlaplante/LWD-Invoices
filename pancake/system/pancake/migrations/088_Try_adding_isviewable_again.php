<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Try_adding_isviewable_again extends CI_Migration
{
    public function up()
	{
		// This is stil missing from mine, somehow? Phil
		add_column('proposals', 'is_viewable', 'tinyint', 1, 0);
    }
    
    public function down()
	{
	
    }
}