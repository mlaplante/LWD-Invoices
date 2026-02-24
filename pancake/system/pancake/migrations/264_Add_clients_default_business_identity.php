<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_clients_default_business_identity extends Pancake_Migration {

    public function up() {
        $buffer = $this->db->get("business_identities")->row_array();
        $default_business_id = $buffer['id'];

        $this->db->where('business_identity', null)->update('clients', [
            'business_identity' => $default_business_id,
        ]);
    }

    public function down() {

    }

}
