<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_default_currency_code extends CI_Migration {

    public function up() {
        add_column("clients", "default_currency_code", "varchar", 3, null, true);
    }

    public function down() {

    }

}
