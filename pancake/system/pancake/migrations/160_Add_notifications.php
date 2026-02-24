<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_notifications extends CI_Migration {

    public function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS ".$this->db->dbprefix('notifications')." (
          `id` int(11) NOT NULL AUTO_INCREMENT,
          `context` varchar(255) NOT NULL,
          `context_id` int(11) NOT NULL,
          `message` TEXT NOT NULL,
          `seen` tinyint(1) NOT NULL DEFAULT '0',
          `created` int(11) NOT NULL,
          PRIMARY KEY (`id`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

}