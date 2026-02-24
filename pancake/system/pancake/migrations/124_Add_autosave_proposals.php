<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_autosave_proposals extends CI_Migration {
    function up() {
        Settings::create('autosave_proposals', 1);
    }
    
    function down() {
        Settings::delete('autosave_proposals');
    }
}