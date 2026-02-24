<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Change_api_params extends CI_Migration
{
    public function up()
	{
		$this->db->query("ALTER TABLE  ".$this->db->dbprefix("logs")." 
			MODIFY `params` TEXT NULL");
    }
    
    public function down()
	{
	
    }
}