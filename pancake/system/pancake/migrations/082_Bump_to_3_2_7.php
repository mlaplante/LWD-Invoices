<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Bump_to_3_2_7 extends CI_Migration {
    function up() {
        Settings::setVersion('3.2.7');
	
	
	
    }
    
    function down() {
        Settings::setVersion('3.2.6');
    }
}