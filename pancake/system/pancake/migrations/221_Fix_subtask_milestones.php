<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_subtask_milestones extends CI_Migration {

    function up() {
        $project_tasks = $this->db->dbprefix("project_tasks");
        $this->db->query("update $project_tasks a left join $project_tasks b on a.parent_id = b.id set a.milestone_id = b.milestone_id where b.milestone_id is not null and a.milestone_id != b.milestone_id");
    }

    function down() {
        
    }

}
