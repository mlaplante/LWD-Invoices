<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Make_proposal_number_a_varchar extends CI_Migration {

    public function up() {
        $proposals = $this->db->dbprefix("proposals");
        $this->db->query("alter table `$proposals` change `proposal_number` `proposal_number` varchar(190) default ''");
    }

    public function down() {

    }

}
