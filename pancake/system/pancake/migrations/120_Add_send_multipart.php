<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_send_multipart extends CI_Migration {
    function up() {
        Settings::create('send_multipart', 1);
    }
    
    function down() {
        Settings::delete('send_multipart');
    }
}