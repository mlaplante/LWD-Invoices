<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Drop_default_invoice_title extends CI_Migration {

    function up() {
        Settings::delete('default_invoice_title');
    }

    function down() {

    }

}
