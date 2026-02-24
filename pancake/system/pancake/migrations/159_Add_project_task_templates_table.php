<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_project_task_templates_table extends CI_Migration {

    public function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS ".$this->db->dbprefix('project_task_templates')." (
          `id` int(11) NOT NULL AUTO_INCREMENT,
          `project_id` int(11) NOT NULL,
          `parent_id` int(11) NULL DEFAULT NULL,
          `assigned_user_id` int(11) NULL DEFAULT NULL,
          `name` varchar(255) NOT NULL,
          `rate` decimal(10, 2) NULL DEFAULT NULL,
          `hours` decimal(10, 2) NULL DEFAULT NULL,
          `notes` text NULL DEFAULT NULL,
          `is_viewable` tinyint(1) NOT NULL DEFAULT '0',
          PRIMARY KEY (`id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

}