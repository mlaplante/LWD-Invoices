<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Drop_update_tables extends CI_Migration {

    function up() {
        $this->db->query("drop table if exists ".$this->db->dbprefix("updates"));
        $this->db->query("drop table if exists ".$this->db->dbprefix("update_files"));
    }

    function down() {

    }

}
