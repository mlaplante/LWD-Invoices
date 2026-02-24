<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_tax_id_for_client_ticket_support_rate extends CI_Migration {

    public function up() {
        add_column('client_ticket_support_rate_matrix', 'tax_id', 'int', '255', 0);
    }

    public function down() {
        
    }

}