<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Improve_project_templates extends CI_Migration {

    function up() {
        $project_tasks = $this->db->dbprefix("project_tasks");
        $this->db->query("ALTER TABLE $project_tasks CHANGE `projected_hours` `projected_hours` FLOAT  NOT NULL  DEFAULT '0'");
        
        $project_milestone_templates = $this->db->dbprefix("project_milestone_templates");
        $this->db->query("CREATE TABLE IF NOT EXISTS $project_milestone_templates (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `project_id` int(10) unsigned NOT NULL,
  `assigned_user_id` int(10) unsigned DEFAULT NULL,
  `color` varchar(50) NOT NULL,
  `is_viewable` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
        
        add_column('project_task_templates', "milestone_id", "int", 10, 0, false);
        
    }

    function down() {
        
    }

}
