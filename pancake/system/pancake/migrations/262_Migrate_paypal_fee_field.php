<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Migrate_paypal_fee_field extends CI_Migration {

    public function up() {
        $this->db->where('gateway', 'paypal_m');
        $this->db->where('field', 'paypal_fee');
        $this->db->where('type', 'FIELD');
        $buffer = $this->db->get('gateway_fields')->result_array();
        $existing_paypal_fees = [];
        foreach ($buffer as $row) {
            $existing_paypal_fees[$row['business_identity_id']] = $row['value'];
        }

        $this->db->where('gateway', 'paypal_m');
        $this->db->where('field', 'surcharge');
        $this->db->where('type', 'FIELD');
        $buffer = $this->db->get('gateway_fields')->result_array();
        $paypal_surcharges = [];
        foreach ($buffer as $row) {
            $paypal_surcharges[$row['business_identity_id']] = $row['value'];
        }

        foreach ($existing_paypal_fees as $business_identity_id => $fee) {
            if (!isset($paypal_surcharges[$business_identity_id])) {
                $this->db->insert('gateway_fields', [
                    'gateway' => 'paypal_m',
                    'field' => 'surcharge',
                    'type' => 'field',
                    'business_identity_id' => $business_identity_id,
                    'value' => $fee,
                ]);
            }
        }
    }

    public function down() {

    }

}
