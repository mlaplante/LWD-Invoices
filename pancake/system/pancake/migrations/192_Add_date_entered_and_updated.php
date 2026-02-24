<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_date_entered_and_updated extends CI_Migration {

    function up() {
        add_column('project_tasks', 'date_entered', 'timestamp', null, null, true);
        
        $result = $this->db->query("SHOW COLUMNS FROM " . $this->db->dbprefix('project_tasks') . " LIKE 'date_updated'")->row_array();

        if (!isset($result['Field']) or $result['Field'] != "date_updated") {
            $this->db->query("ALTER TABLE  `".$this->db->dbprefix("project_tasks")."` ADD  `date_updated` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP");
        }
    }

    function down() {
        drop_column('project_tasks', 'date_entered');
        drop_column('project_tasks', 'date_updated');
    }

}
