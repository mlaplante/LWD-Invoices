<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_business_identity_gateway_settings extends CI_Migration {

    public function up() {
        add_column("gateway_fields", "business_identity_id", "unsigned_int", 11, null, true);

        $this->db->select('id');
        $businesses = $this->db->get('business_identities')->result_array();
        $this->db->where_in('type', ['ENABLED', 'FIELD', 'RECURRING_TOKEN']);
        $this->db->where('business_identity_id is null');
        $gateway_fields_to_update = $this->db->get('gateway_fields')->result_array();
        if (count($gateway_fields_to_update)) {
            $insert_batch = [];
            foreach ($businesses as $business_id) {
                $business_id = $business_id['id'];

                foreach ($gateway_fields_to_update as $field) {
                    $insert_batch[] = [
                        "gateway" => $field["gateway"],
                        "field" => $field["field"],
                        "value" => $field["value"],
                        "type" => $field["type"],
                        "business_identity_id" => $business_id,
                    ];
                }
            }

            if (count($insert_batch)) {
                $this->db->insert_batch('gateway_fields', $insert_batch);

                $this->db->where_in('type', ['ENABLED', 'FIELD', 'RECURRING_TOKEN']);
                $this->db->where('business_identity_id is null');
                $this->db->delete('gateway_fields');
            }
        }
    }

    public function down() {

    }

}
