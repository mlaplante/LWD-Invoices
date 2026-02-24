<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_suppliers_categories extends CI_Migration {

    public function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('project_expenses_suppliers') . " (
			`id` int(10) unsigned NOT NULL AUTO_INCREMENT,
			`name` varchar(255) NOT NULL DEFAULT '',
			`description` text NULL,
			`notes` text NULL,
			PRIMARY KEY (`id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
		
		
		$this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('project_expenses_categories') . " (
			`id` int(10) unsigned NOT NULL AUTO_INCREMENT,
			`parent_id` int(10) unsigned NULL,
			`name` varchar(255) NOT NULL DEFAULT '',
			`description` text NULL,
			`notes` text NULL,
			PRIMARY KEY (`id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

}
