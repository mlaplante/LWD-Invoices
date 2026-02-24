<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Lengthen_settings extends CI_Migration {

    function up() {
        $this->db->query("ALTER TABLE ".$this->db->dbprefix("settings")." CHANGE `value` `value` LONGTEXT  CHARACTER SET utf8  NULL");
    }

    function down() {

    }

}
