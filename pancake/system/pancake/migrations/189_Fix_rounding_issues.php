<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_rounding_issues extends CI_Migration {
    
    function up() {
        $this->db->query("ALTER TABLE ".$this->db->dbprefix("invoices")." CHANGE  `amount`  `amount` DECIMAL( 20, 10 ) NULL DEFAULT  '0'");
    }
    
    function down() {
        
    }
    
}