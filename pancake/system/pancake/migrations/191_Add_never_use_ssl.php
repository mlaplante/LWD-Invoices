<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_never_use_ssl extends CI_Migration {

    function up() {
        Settings::create("never_use_ssl", "0");
        
    }

    function down() {
        Settings::delete("never_use_ssl");
    }

}