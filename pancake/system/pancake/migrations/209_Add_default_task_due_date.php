<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_default_task_due_date extends CI_Migration {

    function up() {
        Settings::create('default_task_due_date', '7');
    }

    function down() {
        Settings::delete('default_task_due_date');
    }

}
