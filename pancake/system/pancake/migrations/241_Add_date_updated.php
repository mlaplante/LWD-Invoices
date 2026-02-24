<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_date_updated extends CI_Migration {

    function up() {
        add_column("users", "date_updated", "timestamp", null, null, false);
        add_column("project_times", "date_updated", "timestamp", null, null, false);
    }

    function down() {

    }

}
