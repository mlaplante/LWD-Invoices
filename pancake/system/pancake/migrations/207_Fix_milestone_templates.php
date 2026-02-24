<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_milestone_templates extends CI_Migration {

    function up() {
        $old_table = $this->db->dbprefix("project_milestones_templates");
        $new_table = $this->db->dbprefix("project_milestone_templates");
        $table_exists = $this->db->query("show tables like '$old_table'")->num_rows() > 0;
        if ($table_exists) {
            $this->db->query("RENAME TABLE $old_table TO $new_table");
        }
    } 

    function down() {
        
    }

}
