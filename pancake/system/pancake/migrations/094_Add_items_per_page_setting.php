<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_items_per_page_setting extends CI_Migration {
    function up() {
        Settings::create('items_per_page', 10);
    }
    
    function down() {
        
    }
}