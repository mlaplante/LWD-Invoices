<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_currency_format extends CI_Migration {

    function up() {
        add_column("currencies", "format", "varchar", "190", json_encode(array(
            "symbol" => "before",
            "decimal" => ".",
            "thousand" => ",",
            "decimals" => 2,
        )), false);
    }

    function down() {

    }

}
