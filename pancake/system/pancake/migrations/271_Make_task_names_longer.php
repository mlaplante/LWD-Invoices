<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Make_task_names_longer extends Pancake_Migration {

    public function up() {
        $this->builder->edit_column("project_tasks", "name", "varchar", 1024, null, false);
    }

    public function down() {

    }

}
