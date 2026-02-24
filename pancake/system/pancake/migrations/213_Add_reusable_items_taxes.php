<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_reusable_items_taxes extends CI_Migration {

    function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix("items_taxes") . " (
   `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `tax_id` int(11) unsigned NOT NULL DEFAULT 0,
  `item_id` int(11) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `tax_id` (`tax_id`),
  KEY `item_id` (`item_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;");

        if ($this->db->count_all("items_taxes") == 0) {
            # Data has not yet been migrated; migrate it. 

            $insert_batch = array();
            foreach ($this->db->select("id, tax_id")->get("items")->result_array() as $row) {
                $insert_batch[] = array(
                    "tax_id" => $row['tax_id'],
                    "item_id" => $row['id'],
                );
            }

            if (count($insert_batch)) {
                $this->db->insert_batch("items_taxes", $insert_batch);
            }
        }
    }

}
