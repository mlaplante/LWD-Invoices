<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_assignments extends CI_Migration {

    public function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('assignments') . " (
			`user_id` INT( 255 ) NOT NULL ,
                        `item_id` INT( 255 ) NOT NULL ,
                        `item_type` VARCHAR( 255 ) NOT NULL DEFAULT '',
			KEY `user_id` (`user_id`),
                        KEY `item_id` (`item_id`),
                        KEY `item_type` (`item_type`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

    public function down() {
        $this->dbforge->drop_table('assignments');
    }

}
