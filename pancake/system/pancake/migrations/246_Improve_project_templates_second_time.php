<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Improve_project_templates_second_time extends CI_Migration {

    function up() {
        add_column("project_templates", "is_flat_rate", "boolean", null, 0, false);
        add_column("project_task_templates", "is_flat_rate", "boolean", null, 0, false);

        add_column('project_templates', 'projected_hours', 'float', null, 0);
        add_column('project_task_templates', 'projected_hours', 'float', null, 0);

        add_column('project_task_templates', 'status_id', 'integer', 255, 0);
    }

    function down() {
        drop_column("project_templates", "is_flat_rate");
        drop_column("project_task_templates", "is_flat_rate");

        drop_column("project_templates", "projected_hours");
        drop_column("project_task_templates", "projected_hours");

        drop_column("project_task_templates", "status_id");
    }

}
