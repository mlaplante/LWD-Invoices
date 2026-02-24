<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_new_settings extends CI_Migration {

    public function up() {
        Settings::create("gmail_email", "");
        Settings::create("gmail_access_token", "");
        Settings::create("gmail_refresh_token", "");
        Settings::create("gmail_expiry_timestamp", "");
    }

    public function down() {

    }

}
