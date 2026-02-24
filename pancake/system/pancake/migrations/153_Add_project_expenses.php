<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_project_expenses extends CI_Migration {

    public function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('project_expenses') . " (
			`id` int(10) unsigned NOT NULL AUTO_INCREMENT,
			`project_id` int(10) unsigned NOT NULL,
			`name` varchar(255) NOT NULL DEFAULT '',
			`description` text NULL,
			`qty` int(10) unsigned NOT NULL DEFAULT '0',
			`rate` decimal(8,2) NOT NULL,
			`tax_id` int(10) NOT NULL DEFAULT '0',
			PRIMARY KEY (`id`),
			INDEX project_id (`project_id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

    public function down() {
        $this->dbforge->drop_table('project_expenses');
    }

}
