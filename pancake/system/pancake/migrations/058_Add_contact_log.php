<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_contact_log extends CI_Migration {
    
	public function up()
	{
		$this->db->query('CREATE TABLE IF NOT EXISTS '.$this->db->dbprefix('contact_log').' (
		  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
		  `client_id` int(11) unsigned NOT NULL,
		  `method` enum("phone","email") NOT NULL,
		  `contact` varchar(255) NOT NULL,
		  `subject` varchar(255) NOT NULL,
		  `content` text,
		  `sent_date` int(10) unsigned NOT NULL,
		  `duration` int(11) NOT NULL,
		  PRIMARY KEY (`id`)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8;');
    }
    
	public function down()
	{
		$this->dbforge->drop_table('contact_log');
    }
}