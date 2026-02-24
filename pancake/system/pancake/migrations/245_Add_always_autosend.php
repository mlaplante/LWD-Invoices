<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_always_autosend extends CI_Migration {

    function up() {
        Settings::create("always_autosend", 0);
    }

    function down() {
        Settings::delete("always_autosend");
    }

}
