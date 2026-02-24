<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_send_x_days_before_again extends CI_Migration {
    function up() {
        Settings::create('send_x_days_before', 7);
    }
    
    function down() {
        
    }
}