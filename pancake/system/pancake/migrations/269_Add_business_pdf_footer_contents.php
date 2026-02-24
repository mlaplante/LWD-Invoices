<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_business_pdf_footer_contents extends CI_Migration {

    public function up() {
        add_column("business_identities", "pdf_footer_contents", "longtext", null, null, true);
    }

    public function down() {

    }

}
