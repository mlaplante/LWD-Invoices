<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_settings_for_creating_tickets extends CI_Migration {

    function up() {
        add_column('clients', "can_create_support_tickets", "boolean", null, 0, false);
    }

    function down() {
        drop_column('clients', "can_create_support_tickets");
    }

}
