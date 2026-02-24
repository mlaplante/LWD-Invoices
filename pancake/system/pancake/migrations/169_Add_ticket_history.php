<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_ticket_history extends CI_Migration {

    public function up() {
		$this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('ticket_history') . " (
			`id` int(10) unsigned NOT NULL AUTO_INCREMENT,
			`ticket_id` int(10) unsigned NOT NULL,
			`user_id` int(10) unsigned NULL,
			`status_id` int(10) unsigned NOT NULL,
			`user_name` varchar(255) NOT NULL,
			`created` int(10) unsigned NOT NULL,
			PRIMARY KEY (`id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

}
