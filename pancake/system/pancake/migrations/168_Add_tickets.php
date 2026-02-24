<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_tickets extends CI_Migration {

    public function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('tickets') . " (
			`id` int(10) unsigned NOT NULL AUTO_INCREMENT,
			`client_id` int(10) unsigned NOT NULL,
			`assigned_user_id` int(10) unsigned NULL,
			`status_id` int(10) unsigned NOT NULL,
			`priority_id` int(10) unsigned NOT NULL,
			`subject` varchar(255) NOT NULL DEFAULT '',
			`resolved` tinyint(1) NOT NULL,
			`created` int(10) unsigned NOT NULL,
			PRIMARY KEY (`id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
		
		
		$this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('ticket_posts') . " (
			`id` int(10) unsigned NOT NULL AUTO_INCREMENT,
			`ticket_id` int(10) unsigned NOT NULL,
			`user_id` int(10) unsigned NULL,
			`user_name` varchar(255) NOT NULL,
			`message` text NULL,
			`orig_filename` varchar(255) NOT NULL,
		  	`real_filename` TEXT NOT NULL,
			`created` int(10) unsigned NOT NULL,
			PRIMARY KEY (`id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

}
