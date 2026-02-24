<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Update_api_tables extends CI_Migration {

    function up() {
        add_column("keys", "is_private_key", "tinyint", 1, 0);
        add_column("keys", "ip_addresses", "text", null, null, true);
        $this->db->query("ALTER TABLE ".$this->db->dbprefix("logs")." CHANGE `ip_address` `ip_address` VARCHAR(45)  CHARACTER SET utf8  NOT NULL");
        add_column("logs", "rtime", "float", null, null, true);
    }

    function down() {
        
    }

}
