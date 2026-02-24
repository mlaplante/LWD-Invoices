<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_custom_css extends CI_Migration {
    
    public function up() {
	Settings::create('frontend_css', '');
	Settings::create('backend_css', '');
    }
    
    public function down() {
        Settings::delete('frontend_css');
	Settings::delete('backend_css');
    }
}