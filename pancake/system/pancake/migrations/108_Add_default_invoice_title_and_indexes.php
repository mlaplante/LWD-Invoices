<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_default_invoice_title_and_indexes extends CI_Migration {
    function up() {
        Settings::create('default_invoice_title', 'Invoice');
        $completed = false;
        $result = $this->db->query("show indexes in ".$this->db->dbprefix('invoice_rows'))->result_array();
        foreach ($result as $index) {
            if ($index['Column_name'] == 'unique_id') {
                $completed = true;
            }
        }
        if (!$completed) {
            $this->db->query("ALTER TABLE  `".$this->db->dbprefix('invoice_rows')."` ADD INDEX (  `unique_id` )");
            $this->db->query("ALTER TABLE  `".$this->db->dbprefix('partial_payments')."` ADD INDEX (  `unique_invoice_id` )");
        }
    }
    
    function down() {
        Settings::delete('default_invoice_title');
    }
}