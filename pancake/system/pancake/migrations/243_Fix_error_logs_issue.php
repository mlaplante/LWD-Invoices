<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_error_logs_issue extends CI_Migration {

    function up() {
        $this->db->query("alter table " . $this->db->dbprefix("error_logs") . " change `latest_occurrence` `latest_occurrence` timestamp  null  default null;");
    }

    function down() {

    }

}
