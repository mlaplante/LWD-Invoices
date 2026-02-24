<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_indexes_for_optimization extends Pancake_Migration {

    public function up() {
        $this->builder->create_index("invoices", ["type", "is_archived", "client_id"]);
        $this->builder->create_index("invoices", ["client_id"]);

        if ($this->builder->column_exists("gateway_fields", "type")) {
            $this->dbforge->modify_column("gateway_fields", ["type" => [
                'type' => "enum",
                'null' => false,
                'unique' => false,
                'auto_increment' => false,
                'default' => null,
                'constraint' => ["CLIENT", "INVOICE", "ENABLED", "FIELD", "RECURRING_TOKEN"],
            ]]);
        }

        $this->builder->create_index("gateway_fields", ["business_identity_id", "type"]);
    }

    public function down() {

    }

}
