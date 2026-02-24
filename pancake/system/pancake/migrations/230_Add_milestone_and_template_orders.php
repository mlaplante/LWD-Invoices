<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_milestone_and_template_orders extends CI_Migration {

    function up() {
        add_column("project_task_templates", "order", "int", "11", 0, false);
        add_column("project_milestone_templates", "order", "int", "11", 0, false);
        add_column("project_milestones", "order", "int", "11", 0, false);
    }

    function down() {
        drop_column('project_task_templates', 'order');
        drop_column('project_milestone_templates', 'order');
        drop_column('project_milestones', 'order');
    }

}
