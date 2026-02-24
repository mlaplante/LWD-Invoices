<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_archived_invoices_estimates_etc extends CI_Migration {

    function up() {
        add_column("invoices", "is_archived", "boolean", null, 0, false);
        add_column("proposals", "is_archived", "boolean", null, 0, false);
    }

    function down() {
        drop_column("invoices", "is_archived");
        drop_column("proposals", "is_archived");
    }

}
