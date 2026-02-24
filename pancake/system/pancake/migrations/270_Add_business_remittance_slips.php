<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_business_remittance_slips extends CI_Migration {

    public function up() {
        add_column("business_identities", "remittance_slip", "longtext", null, null, true, '', function () {
            $remittance_slip = $this->db->where('slug', 'remittance_slip')->get('settings')->row_array();
            $remittance_slip = $remittance_slip['value'];

            $this->db->update("business_identities", [
                'remittance_slip' => $remittance_slip,
            ]);
        });

        add_column("business_identities", "include_remittance_slip", "boolean", null, true, false, '', function () {
            $include_remittance_slip = $this->db->where('slug', 'include_remittance_slip')->get('settings')->row_array();
            $include_remittance_slip = $include_remittance_slip['value'];

            $this->db->update("business_identities", [
                'include_remittance_slip' => $include_remittance_slip,
            ]);
        });
    }

    public function down() {

    }

}
