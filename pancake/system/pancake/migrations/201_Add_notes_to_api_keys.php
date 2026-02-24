<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_notes_to_api_keys extends CI_Migration {

    function up() {
        add_column("keys", "note", "text", null, null, true);
    }

    function down() {
        
    }

}
