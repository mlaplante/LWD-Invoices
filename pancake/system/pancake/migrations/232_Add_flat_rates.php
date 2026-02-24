<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_flat_rates extends CI_Migration {

    public function up() {
        add_column("projects", "is_flat_rate", "boolean", null, 0, false);
        add_column("project_tasks", "is_flat_rate", "boolean", null, 0, false);
    }

    public function down() {
        drop_column("projects", "is_flat_rate");
        drop_column("project_tasks", "is_flat_rate");
    }

}
