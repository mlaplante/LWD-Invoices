<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_is_timesheet_viewable extends CI_Migration {

    public function up() {
        add_column("projects", "is_timesheet_viewable", "boolean", null, false, false, "is_viewable");
        add_column("project_tasks", "is_timesheet_viewable", "boolean", null, null, true, "is_viewable");

        add_column("project_templates", "is_timesheet_viewable", "boolean", null, false, false, "is_viewable");
        add_column("project_task_templates", "is_timesheet_viewable", "boolean", null, null, true, "is_viewable");
    }

    public function down() {

    }

}
