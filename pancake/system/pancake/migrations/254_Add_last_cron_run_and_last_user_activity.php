<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_last_cron_run_and_last_user_activity extends CI_Migration {

    public function up() {
        Settings::create("last_cron_run_datetime", "");
        add_column("users", "last_activity", "datetime", null, null, true);
    }

    public function down() {

    }

}
