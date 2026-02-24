<?php

defined('BASEPATH') or exit('No direct script access allowed');

class Migration_Add_can_view_invoices_without_passphrase extends Pancake_Migration
{

    public function up()
    {
        $this->builder->create_column("clients", "can_view_invoices_without_passphrase", "boolean", null, false, false);
    }

    public function down()
    {

    }

}
