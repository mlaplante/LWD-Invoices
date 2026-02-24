<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_invoice_index extends CI_Migration {

    function up() {
        $this->db->query("ALTER TABLE " . $this->db->dbprefix('invoices') . " ADD INDEX (`unique_id`);");
    }

    function down() {
        $this->db->query("ALTER TABLE " . $this->db->dbprefix('invoices') . " DROP INDEX `unique_id`;");
    }

}
