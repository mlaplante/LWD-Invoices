<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_task_order extends CI_Migration {

    function up() {
        add_column("project_tasks", "order", "int", "11", 0, false);
    }

    function down() {
        drop_column("project_tasks", "order");
    }

}
