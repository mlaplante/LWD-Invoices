<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_invoice_records extends CI_Migration {

    public function up() {
        # This migration does nothing.
        # It is here in order to keep upgrade compatibility between 3.X and 4.X.
        # The code that used to be here now requires pancake_invoice_rows_taxes,
        # so it was moved to a new migration -after- pancake_invoice_rows_taxes was created.
    }

    public function down() {

    }

}