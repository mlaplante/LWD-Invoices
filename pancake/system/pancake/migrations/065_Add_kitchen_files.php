<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_kitchen_files extends CI_Migration {
    
	public function up()
	{
		$this->dbforge->drop_table('project_updates');

		$this->db->query('CREATE TABLE IF NOT EXISTS '.$this->db->dbprefix('project_files').' (
		  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
		  `comment_id` int(11) unsigned NOT NULL,
		  `created` int(10) unsigned NOT NULL,
		  `orig_filename` varchar(255) NOT NULL,
		  `real_filename` TEXT NOT NULL,
		  PRIMARY KEY (`id`),
		  INDEX comment_id (`comment_id`)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8;');
    }
    
	public function down()
	{
		$this->dbforge->drop_table('project_files');
    }
}