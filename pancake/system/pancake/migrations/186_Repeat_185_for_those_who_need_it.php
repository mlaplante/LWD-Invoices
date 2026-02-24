<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Repeat_185_for_those_who_need_it extends CI_Migration {

    public function up() {
        $this->load->model('users/user_m');
        if ($this->user_m->count_all() == 1) {
            $tables = array(
                'project_tasks',
                'project_milestones',
                'project_task_templates',
                'tickets',
            );
            
            $users = $this->user_m->get_users_list();
            $users = array_keys($users);
            $user = reset($users);
            
            foreach ($tables as $table) {
                $this->db->update($table, array('assigned_user_id' => $user));
            }
        }
    }

    public function down() {
        
    }

}
