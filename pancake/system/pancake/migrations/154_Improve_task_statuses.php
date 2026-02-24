<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Improve_task_statuses extends CI_Migration {

    function up() {

        add_column('project_task_statuses', 'text_shadow', 'varchar', 255);
        add_column('project_task_statuses', 'box_shadow', 'varchar', 255);

        $default_statuses = array(
            array(
                'id' => 1,
                'title' => 'Pending',
                'background_color' => '#41b8e3',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #1e83a8',
                'box_shadow' => '0px 1px 1px 0px #1e83a8',
            ),
            array(
                'id' => 2,
                'title' => 'In Progress',
                'background_color' => '#88ce5c',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #5ca534',
                'box_shadow' => '0px 1px 1px 0px #62a33d',
            ),
            array(
                'id' => 3,
                'title' => 'Waiting',
                'background_color' => '#ffa123',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #cd7e15',
                'box_shadow' => '0px 1px 1px 0px #cd7e15',
            ),
            array(
                'id' => 4,
                'title' => 'Suspended',
                'background_color' => '#9a9a9a',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #787878',
                'box_shadow' => '0px 1px 1px 0px #787878',
            ),
            array(
                'id' => 5,
                'title' => 'Abandoned',
                'background_color' => '#eb4141',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #b32222',
                'box_shadow' => '0px 1px 1px 0px #b32222',
            ),
        );

        foreach ($default_statuses as $status) {
            if ($this->db->where('id', $status['id'])->count_all_results('project_task_statuses') == 0) {
                $this->db->insert('project_task_statuses', $status);
            }
        }
    }

    function down() {
        
    }

}