<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_custom_js extends CI_Migration {

    function up() {
        Settings::set("frontend_js", "");
        Settings::set("backend_js", "");
    }

    function down() {
        Settings::delete("frontend_js");
        Settings::delete("backend_js");
    }

}
