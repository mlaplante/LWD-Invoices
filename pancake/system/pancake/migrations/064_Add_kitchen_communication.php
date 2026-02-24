<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_kitchen_communication extends CI_Migration {
    
	public function up()
	{
		$this->db->query('CREATE TABLE IF NOT EXISTS '.$this->db->dbprefix('comments').' (
		  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
		  `client_id` int(11) unsigned NOT NULL,
		  `user_id` int(11) unsigned NULL,
		  `user_name` varchar(255) NOT NULL,
		  `created` int(10) unsigned NOT NULL,
		  `item_type` varchar(255) NOT NULL,
		  `item_id` int(11) NULL,
		  `comment` TEXT NOT NULL,
		  PRIMARY KEY (`id`),
		  INDEX client_id (`client_id`),
		  INDEX user_id (`user_id`),
		  INDEX item_type (`item_type`),
		  INDEX item_id (`item_id`)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8;');

		$this->db->query('CREATE TABLE IF NOT EXISTS '.$this->db->dbprefix('project_updates').' (
		  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
		  `project_id` int(11) unsigned NOT NULL,
		  `name` varchar(255) NOT NULL,
		  `created` int(10) unsigned NOT NULL,
		  PRIMARY KEY (`id`),
		  INDEX project_id (`project_id`)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8;');
    }
    
	public function down()
	{
		$this->dbforge->drop_table('comments');
		$this->dbforge->drop_table('project_updates');
    }
}