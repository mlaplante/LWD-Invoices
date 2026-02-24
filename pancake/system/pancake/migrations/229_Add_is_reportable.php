<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_is_reportable extends CI_Migration {

    function up() {
        add_column("error_logs", "is_reportable", "boolean", null, 1, false);
    }

    function down() {
        drop_column('error_logs', 'is_reportable');
    }

}
