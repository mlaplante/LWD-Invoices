<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_ticket_status_for_sending_invoice extends CI_Migration {

    function up() {
        Settings::create("ticket_status_for_sending_invoice", "0");
    }

    function down() {
        Settings::delete("ticket_status_for_sending_invoice");
    }

}
