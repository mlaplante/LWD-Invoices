<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_error_id extends CI_Migration {

    function up() {
        add_column("error_logs", "error_id", "varchar", 255, "", false);
    }

    function down() {
        drop_column('error_logs', 'error_id');
    }

}
