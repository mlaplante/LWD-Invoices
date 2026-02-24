<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Increase_maximum_client_email_length extends CI_Migration {

    public function up() {
        $clients = $this->db->dbprefix("clients");
        $this->db->query("alter table `$clients` change `email` `email` varchar(1024) default ''");
    }

    public function down() {

    }

}
