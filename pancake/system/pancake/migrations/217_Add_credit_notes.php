<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_credit_notes extends CI_Migration {

    function up() {
        $this->db->query("ALTER TABLE ".$this->db->dbprefix("invoices")." CHANGE `type` `type` ENUM('SIMPLE','DETAILED','ESTIMATE','CREDIT_NOTE') CHARACTER SET utf8 NULL DEFAULT 'DETAILED'");
    }

    function down() {
        $this->db->query("ALTER TABLE ".$this->db->dbprefix("invoices")." CHANGE `type` `type` ENUM('SIMPLE','DETAILED','ESTIMATE') CHARACTER SET utf8 NULL DEFAULT 'SIMPLE'");
    }

}
