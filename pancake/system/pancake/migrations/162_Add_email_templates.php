<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_email_templates extends CI_Migration {

    public function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS ".$this->db->dbprefix('email_templates')." (
          `id` int(11) NOT NULL AUTO_INCREMENT,
          `type` varchar(255) NOT NULL,
		  `name` varchar(255) NOT NULL,
		  `subject` varchar(255) NOT NULL,
          `content` TEXT NOT NULL,
          `created` int(11) NOT NULL,
          PRIMARY KEY (`id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

}