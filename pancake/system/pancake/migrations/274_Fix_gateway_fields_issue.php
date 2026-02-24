<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_gateway_fields_issue extends Pancake_Migration {

    public function up() {
        $gateway_fields = $this->db->dbprefix("gateway_fields");

        if ($this->builder->column_exists("gateway_fields", "type")) {
            $has_problem = false;
            $results = $this->db->query("show columns from $gateway_fields")->result_array();
            foreach ($results as $result) {
                if ($result["Field"] == "type") {
                    if ($result["Type"] == "enum('''CLIENT'',''INVOICE'',''ENABLED'',''FIELD'',''RECURRING_TOKEN''')") {
                        $has_problem = true; 
                    }
                }
            }

            if ($has_problem) {
                $this->dbforge->modify_column("gateway_fields", ["type" => [
                    'type' => "enum",
                    'null' => false,
                    'unique' => false,
                    'auto_increment' => false,
                    'default' => null,
                    'constraint' => ["CLIENT", "INVOICE", "ENABLED", "FIELD", "RECURRING_TOKEN"],
                ]]);

                $this->db->query("update $gateway_fields set type = 'FIELD' where field not regexp '^[0-9]+$' and field != 'enabled' and type = '';");
                $this->db->query("update $gateway_fields set type = 'ENABLED' where field = 'enabled' and type = '';");
                $this->db->query("update $gateway_fields set type = 'RECURRING_TOKEN' where value like '%{\"token\"%' and type = '';");
                $this->db->query("delete from $gateway_fields where type = '' and field regexp '^[0-9]+$'");
            }
        }


    }

    public function down() {

    }

}
