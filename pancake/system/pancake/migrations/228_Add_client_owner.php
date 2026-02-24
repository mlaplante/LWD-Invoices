<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_client_owner extends CI_Migration {

    function up() {
        add_column('clients', 'owner_id', 'int', 255, 0);
    }

    function down() {
        drop_column('clients', 'owner_id');
    }

}
