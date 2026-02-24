<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_invoice_frequency extends CI_Migration
{

    public function up()
    {
	$this->db->query("ALTER TABLE  ".$this->db->dbprefix('invoices')." CHANGE  `frequency`  `frequency` VARCHAR( 2 ) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL");
    }

    public function down()
    {
	
    }

}