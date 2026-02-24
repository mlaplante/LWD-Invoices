<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_clients_credit_alterations_date extends CI_Migration {

    function up() {
        $result = $this->db->query("SHOW COLUMNS FROM " . $this->db->dbprefix('clients_credit_alterations') . " LIKE 'created_at'")->row_array();

        if (!isset($result['Field']) or $result['Field'] != "created_at") {
            $this->db->query("ALTER TABLE " . $this->db->dbprefix("clients_credit_alterations") . " ADD `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;");
        }
    }

    function down() {
        $this->db->query("ALTER TABLE " . $this->db->dbprefix("clients_credit_alterations") . " DROP `created_at`;");
    }

}
