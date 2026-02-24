<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_lots_of_settings extends CI_Migration {

    function up() {
        Settings::create('send_x_days_before', 7);
        Settings::create('use_utf8_font', '0');
        Settings::create('default_tax_id', '0');
        Settings::create('include_time_entry_dates', '0'); 
        Settings::create('split_line_items_by', 'project_tasks');
        Settings::create('accounting_type', 'cash');
    }

    function down() {
        Settings::delete("send_x_days_before");
        Settings::delete("use_utf8_font");
        Settings::delete("default_tax_id");
        Settings::delete("include_time_entry_dates");
        Settings::delete("split_line_items_by");
        Settings::delete("accounting_type");
    }

}
