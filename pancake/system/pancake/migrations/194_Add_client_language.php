<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_client_language extends CI_Migration {
    
    function up() {
        add_column('clients', 'language', 'varchar', 255);
    }
    
    function down() {
        drop_column('clients', 'language');
    }
    
}