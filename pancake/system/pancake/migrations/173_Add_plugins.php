<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_plugins extends CI_Migration {

    public function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS ".$this->db->dbprefix('plugins')." (
          `slug` varchar(100) NOT NULL,
          `value` text,
          `version` varchar(20),
          PRIMARY KEY (`slug`)
        ) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

}