<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_project_templates_table extends CI_Migration {

    public function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS ".$this->db->dbprefix('project_templates')." (
          `id` int(11) NOT NULL AUTO_INCREMENT,
          `client_id` varchar(10) NULL DEFAULT NULL,
          `name` varchar(255) NOT NULL,
          `description` text NULL DEFAULT NULL,
          `rate` decimal(10, 2) NULL DEFAULT NULL,
          `currency_id` int(11) NULL DEFAULT NULL,
          `exchange_rate` float(10, 5) NOT NULL,
          `is_viewable` tinyint(1) NOT NULL,
          PRIMARY KEY (`id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

    public function down() {
        $this->dbforge->drop_table('project_templates');
    }

}