<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_projected_hours_and_task_statuses extends CI_Migration {
    function up() {
        add_column('project_tasks', 'projected_hours', 'float', null, 0);
        add_column('project_tasks', 'status_id', 'integer', 255, 0);
        add_column('projects', 'projected_hours', 'float', null, 0);
        $this->db->query('CREATE TABLE IF NOT EXISTS `'.$this->db->dbprefix('project_task_statuses').'` (
				  `id` int(11) NOT NULL AUTO_INCREMENT,
				  `title` varchar(255) NOT NULL,
                  `background_color` varchar(50) NOT NULL,
				  `font_color` varchar(50) NOT NULL,
				  PRIMARY KEY (`id`)
				) ENGINE=MYISAM DEFAULT CHARSET=utf8;');
    }
    
    function down() {
        
    }
}