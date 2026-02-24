<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_business_default_invoice_notes extends CI_Migration {

    public function up() {
        add_column("business_identities", "default_invoice_notes", "longtext", null, null, true, '', function () {
            $default_invoice_notes = $this->db->where('slug', 'default_invoice_notes')->get('settings')->row_array();
            $default_invoice_notes = $default_invoice_notes['value'];

            $this->db->update("business_identities", [
                'default_invoice_notes' => $default_invoice_notes,
            ]);
        });
    }

    public function down() {

    }

}
