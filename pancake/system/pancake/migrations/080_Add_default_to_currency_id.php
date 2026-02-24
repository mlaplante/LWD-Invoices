<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_default_to_currency_id extends CI_Migration {
    function up() {
        $this->db->query("ALTER TABLE  ".$this->db->dbprefix("invoices")." CHANGE  `currency_id`  `currency_id` INT( 11 ) NOT NULL DEFAULT  '0'");
    }
    
    function down() {
	
    }
}