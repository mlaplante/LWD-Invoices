<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_invoice_rows_taxes extends CI_Migration {

    function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix("invoice_rows_taxes") . " (
   `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `tax_id` int(11) unsigned NOT NULL DEFAULT 0,
  `invoice_row_id` int(11) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `tax_id` (`tax_id`),
  KEY `invoice_row_id` (`invoice_row_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;");

        if ($this->db->count_all("invoice_rows_taxes") == 0) {
            # Data has not yet been migrated; migrate it. 

            $insert_batch = array();
            foreach ($this->db->select("id, tax_id")->get("invoice_rows")->result_array() as $row) {
                $insert_batch[] = array(
                    "tax_id" => $row['tax_id'],
                    "invoice_row_id" => $row['id'],
                );
            }

            if (count($insert_batch)) {
                $this->db->insert_batch("invoice_rows_taxes", $insert_batch);
            }
        }
    }

}
