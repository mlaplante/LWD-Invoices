<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_discounts extends CI_Migration {

    function up() {
        add_column('invoice_rows', 'discount', 'decimal', ($this->db->dbdriver == "mysqli" ? "65,10" : array(65,10)), 0);
        add_column('invoice_rows', 'discount_is_percentage', 'bool', null, 0);
    }

    function down() {
        drop_column('invoice_rows', 'discount');
        drop_column('invoice_rows', 'discount_is_percentage');
    }

}
