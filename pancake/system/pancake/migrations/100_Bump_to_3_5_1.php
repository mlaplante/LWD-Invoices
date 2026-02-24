<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Bump_to_3_5_1 extends CI_Migration {
    function up() {
        Settings::setVersion('3.5.1');
	
	
	
    }
    
    function down() {
        Settings::setVersion('3.5.0');
    }
}