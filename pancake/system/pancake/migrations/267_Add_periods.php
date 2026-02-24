<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_periods extends Pancake_Migration {

    public function up() {
        $this->builder->create_column("invoice_rows", "period", "decimal", [10, 2], null, true, false, false, 'rate');
    }

    public function down() {

    }

}
