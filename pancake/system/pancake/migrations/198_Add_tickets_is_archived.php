<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_tickets_is_archived extends CI_Migration {

    function up() {
        add_column('tickets', 'is_archived', 'bool', null, 0, false);
    }

    function down() {
        drop_column('tickets', 'is_archived');
    }

}
