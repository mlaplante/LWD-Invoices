<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_include_remittance_slip extends CI_Migration {

    public function up() {
	Settings::create('include_remittance_slip', '1');
    }

    public function down() {
	Settings::delete('include_remittance_slip');
    }

}