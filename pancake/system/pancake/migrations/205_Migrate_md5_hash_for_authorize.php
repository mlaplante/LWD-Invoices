<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Migrate_md5_hash_for_authorize extends CI_Migration {

    function up() {
        $buffer = $this->db->where("gateway", "authorizenet_m")->where("type", "FIELD")->get("gateway_fields")->result_array();
        $fields = array();
        foreach ($buffer as $row) {
            $fields[$row['field']] = $row['value'];
        }

        if (isset($fields['api_key']) and !isset($fields['md5_hash'])) {
            $this->db->insert("gateway_fields", array(
                "gateway" => "authorizenet_m",
                "field" => "md5_hash",
                "value" => $fields['api_key'],
                "type" => "FIELD",
            ));
        }
    }

    function down() {
        
    }

}
