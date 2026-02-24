<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_isviewable_to_proposals extends CI_Migration {
    
	public function up()
	{

		add_column('proposals', 'is_viewable', 'tinyint', 1, 0);

    }
    
	public function down()
	{
		$this->dbforge->remove_column('proposals', 'is_viewable');
    }
}