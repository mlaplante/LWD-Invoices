<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_txn_id_default extends CI_Migration {
    function up() {
        $this->db->query("ALTER TABLE  ".$this->db->dbprefix("partial_payments")." CHANGE  `txn_id`  `txn_id` VARCHAR( 255 ) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL DEFAULT  ''");
    }
    
    function down() {
	
    }
}