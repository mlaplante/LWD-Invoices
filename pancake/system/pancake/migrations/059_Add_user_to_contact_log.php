<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_user_to_contact_log extends CI_Migration {
    
	public function up()
	{
		add_column('contact_log', 'user_id', 'int', 11, 0);	
    }
    
	public function down()
	{
		$this->dbforge->remove_column('contact_log', 'user_id');
    }
}