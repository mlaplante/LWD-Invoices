<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_year_start_end extends CI_Migration {

    function up() {
        Settings::create("year_start_day", "1");
        Settings::create("year_start_month", "1");
    }

    function down() {
        Settings::delete("year_start_day");
        Settings::delete("year_start_month");
    }

}
