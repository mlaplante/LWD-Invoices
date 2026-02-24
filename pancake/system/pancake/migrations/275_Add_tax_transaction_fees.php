<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_tax_transaction_fees extends Pancake_Migration {

    public function up() {
        Settings::create("tax_transaction_fees", "1");
    }

    public function down() {

    }

}
