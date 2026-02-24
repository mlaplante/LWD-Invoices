<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_hide_tax_column extends CI_Migration {

    function up() {
        Settings::create("hide_tax_column", 0);
    }

    function down() {
        Settings::delete("hide_tax_column");
    }

}
