<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_milestones extends CI_Migration {
    
	public function up()
	{
		$this->db->query('CREATE TABLE IF NOT EXISTS '.$this->db->dbprefix('project_milestones').' (
		  `id` int unsigned NOT NULL AUTO_INCREMENT,
		  `name` varchar(255) NOT NULL,
		  `description` text,
		  `project_id` int unsigned NOT NULL,
		  `assigned_user_id` int unsigned DEFAULT NULL,
		  `color` varchar(50) NOT NULL,
		  `target_date` int unsigned DEFAULT NULL,
		  PRIMARY KEY (`id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;');
		
		add_column('project_tasks', 'milestone_id', 'int', 20, 0);
		
    }
    
	public function down()
	{
		$this->dbforge->drop_table('project_milestones');
    }
}