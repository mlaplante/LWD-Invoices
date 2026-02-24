<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_flat_rate_billed_status_for_tasks extends CI_Migration {

    public function up() {
        add_column('project_tasks', 'invoice_item_id', 'int', 11, 0);
    }

    public function down() {
        drop_column('project_tasks', 'invoice_item_id');
    }

}
