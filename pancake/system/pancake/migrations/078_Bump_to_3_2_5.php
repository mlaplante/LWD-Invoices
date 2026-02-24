<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Bump_to_3_2_5 extends CI_Migration {
    function up() {
        Settings::setVersion('3.2.5');
	
	
	
    }
    
    function down() {
        Settings::setVersion('3.2.4');
    }
}