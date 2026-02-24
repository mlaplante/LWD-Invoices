<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_client_id extends Pancake_Migration {

    public function up() {
        $this->builder->delete_relationship("clients_taxes", "client_id");
        $this->builder->edit_column("clients", "id", "unsigned_int", 11, null, false, false, true);
        $this->builder->edit_relationship("clients_taxes", "client_id", "clients", "id", "cascade", "cascade");
        
    }

    public function down() {

    }

}
