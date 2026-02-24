<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Increase_maximum_ip_address_length extends CI_Migration {

    public function up() {
        $users = $this->db->dbprefix("users");
        $this->db->query("alter table `$users` change `ip_address` `ip_address` varchar(45) not null  default ''");
    }

    public function down() {

    }

}
