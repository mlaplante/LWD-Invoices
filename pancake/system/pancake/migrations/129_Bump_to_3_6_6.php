<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Bump_to_3_6_6 extends CI_Migration {
    function up() {
        Settings::setVersion('3.6.6'); 
	
	
	
    }
    
    function down() {
        Settings::setVersion('3.6.5');
    }
}