<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_project_timers extends CI_Migration {

    public function up() {
        
        # This enables us to pause timers and come back to them, and not lose any information.
        
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('project_timers') . " (
			`id` int(10) unsigned NOT NULL AUTO_INCREMENT,
                        `start_timestamp` int(255) not null,
                        `last_modified_timestamp` int(255) not null,
                        `current_seconds` int(255) not null,
			`task_id` int(255) unsigned NOT NULL,
			`user_id` int(255) NOT NULL DEFAULT '0',
			`pauses_json` longtext NULL,
			`is_paused` tinyint(1) not null default '0',
                        `is_over` tinyint(1) not null default '0',
			PRIMARY KEY (`id`),
			INDEX task_id (`task_id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

    public function down() {
        $this->dbforge->drop_table('project_timers');
    }

}
