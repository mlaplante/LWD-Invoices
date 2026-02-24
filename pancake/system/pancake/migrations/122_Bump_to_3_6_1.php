<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Bump_to_3_6_1 extends CI_Migration {
    function up() {
        Settings::setVersion('3.6.1');
	
	
	
    }
    
    function down() {
        Settings::setVersion('3.6.0');
    }
}