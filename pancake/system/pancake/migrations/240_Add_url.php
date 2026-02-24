<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_url extends CI_Migration {

    function up() {
        $this->db->query("alter table " . $this->db->dbprefix("error_logs") . " change `latest_occurrence` `latest_occurrence` timestamp  null  default null;");
        add_column("error_logs", "url", "text", null, null, true);
    }

    function down() {
        drop_column('error_logs', 'url');
    }

}
