<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Improve_notifications extends CI_Migration {

    function up() {
        add_column('notifications', 'action', 'varchar', '255', null, true);
        add_column('notifications', 'user_id', 'integer', '255', null, true);
        add_column('notifications', 'client_id', 'integer', '255', null, true);
    }

    function down() {
        drop_column('notifications', 'action');
        drop_column('notifications', 'user_id');
        drop_column('notifications', 'client_id');
    }

}
