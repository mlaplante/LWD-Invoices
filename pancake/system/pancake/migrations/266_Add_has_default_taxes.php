<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_has_default_taxes extends Pancake_Migration {

    public function up() {
        $this->builder->create_column("clients", "has_custom_tax_ids", "boolean", null, false, false, false, false, null, function () {
            $clients = $this->db->dbprefix("clients");
            $clients_taxes = $this->db->dbprefix("clients_taxes");
            $this->db->query("update $clients set has_custom_tax_ids = 1 where id in (select distinct client_id from $clients_taxes where is_default = 1)");
        });
    }

    public function down() {

    }

}
