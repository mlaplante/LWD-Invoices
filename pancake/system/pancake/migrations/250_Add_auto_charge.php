<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_auto_charge extends CI_Migration {

    public function up() {
        add_column("invoices", "auto_charge", "boolean", null, false, false);
    }

    public function down() {

    }

}
