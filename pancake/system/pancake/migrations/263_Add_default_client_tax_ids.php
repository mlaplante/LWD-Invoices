<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_default_client_tax_ids extends Pancake_Migration {

    public function up() {
        $this->builder->edit_column("clients", "id", "unsigned_int", 11, null, false);

        $table = "clients_taxes";
        $this->builder->edit_column($table, "client_id", "unsigned_int", 11, null, false);
        $this->builder->create_column($table, "is_default", "boolean", null, false, false);

        $clients_taxes = $this->db->dbprefix("clients_taxes");
        $clients = $this->db->dbprefix("clients");
        $taxes = $this->db->dbprefix("taxes");

        if ($this->builder->is_innodb($table)) {
            if ($this->builder->is_innodb("taxes")) {
                # Clean up orphans before adding a relationship:
                $this->db->query("delete from $clients_taxes where tax_id not in (select id from $taxes)");
                $this->builder->edit_relationship($table, "tax_id", "taxes", "id", "cascade", "cascade");
            }

            if ($this->builder->is_innodb("clients")) {
                # Clean up orphans before adding a relationship:
                $this->db->query("delete from $clients_taxes where client_id not in (select id from $clients)");
                $this->builder->edit_relationship($table, "client_id", "clients", "id", "cascade", "cascade");
            }
        }

        $this->builder->delete_column($table, "id");
        $this->builder->create_index($table, ["tax_id", "client_id"], false, true);
    }

    public function down() {

    }

}
