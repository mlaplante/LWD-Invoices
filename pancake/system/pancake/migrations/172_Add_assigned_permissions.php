<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_assigned_permissions extends CI_Migration {

    public function up() {
        # Permission Level.
        # Defines what actions a user can perform.
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('assignments_permissions') . " (
                        `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
			`user_id` INT( 255 ) NOT NULL ,
                        `client_id` INT( 255 ) NOT NULL ,
                        `item_type` VARCHAR( 255 ) NOT NULL DEFAULT '',
                        `item_id` INT( 255 ) NOT NULL ,
                        `can_all` TINYINT( 1 ) NOT NULL ,
                        `can_create` TINYINT( 1 ) NOT NULL ,
                        `can_read` TINYINT( 1 ) NOT NULL ,
                        `can_update` TINYINT( 1 ) NOT NULL ,
                        `can_delete` TINYINT( 1 ) NOT NULL ,
                        `can_generate_from_project`  TINYINT( 1 ) NOT NULL ,
                        `can_send` TINYINT( 1 ) NOT NULL ,
			PRIMARY KEY (`id`)
		) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
        
        add_column('assignments', 'can_read', 'int', 1, 0);
        add_column('assignments', 'can_update', 'int', 1, 0);
        add_column('assignments', 'can_delete', 'int', 1, 0);
        add_column('assignments', 'can_generate_from_project', 'int', 1, 0);
        add_column('assignments', 'can_send', 'int', 1, 0);

        # Owner ID.
        # Used for limiting general users to their own stuff.
        add_column('projects', 'owner_id', 'int', 255, 0);
        add_column('invoices', 'owner_id', 'int', 255, 0);
        add_column('project_expenses', 'owner_id', 'int', 255, 0);
        add_column('proposals', 'owner_id', 'int', 255, 0);
        add_column('project_tasks', 'owner_id', 'int', 255, 0);
        add_column('tickets', 'owner_id', 'int', 255, 0);
    }

    public function down() {
        
    }

}
