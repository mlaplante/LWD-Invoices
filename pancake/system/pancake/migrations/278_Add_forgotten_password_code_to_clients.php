<?php

defined('BASEPATH') or exit('No direct script access allowed');

class Migration_Add_forgotten_password_code_to_clients extends Pancake_Migration
{

    public function up()
    {
        $this->builder->create_column("clients", "forgotten_password_code", "varchar", 40);
    }

    public function down()
    {

    }

}
