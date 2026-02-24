<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Change_default_parent_id extends CI_Migration {

    public function up() {
        $this->db->query("update " . $this->db->dbprefix('project_tasks') . " set parent_id = 0 where ISNULL(parent_id)");
        $this->db->query("ALTER TABLE  " . $this->db->dbprefix('project_tasks') . " CHANGE  `parent_id`  `parent_id` INT( 10 ) NOT NULL DEFAULT  '0'");
        $this->db->query("UPDATE " . $this->db->dbprefix('project_tasks') . " SET `parent_id` = '0' WHERE `" . $this->db->dbprefix('project_tasks') . "`.`parent_id` = null;");
    }

    public function down() {
        
    }

}