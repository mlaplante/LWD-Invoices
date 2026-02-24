<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_filesystem_settings extends CI_Migration {

    public function up() {
        Settings::create("filesystem", "");
    }

    public function down() {

    }

}
