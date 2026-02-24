<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_client_ticket_support_rate_matrix extends CI_Migration{
	
	public function up(){
		$this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('client_ticket_support_rate_matrix') . " (
			`id` int(10) unsigned NOT NULL AUTO_INCREMENT,
			`client_id` int(10) NOT NULL,
			`priority_id` int(10) NOT NULL,
			`rate` float(10,2) NOT NULL,
			PRIMARY KEY (`id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
	}
}