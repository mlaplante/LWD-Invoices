<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Make_unique_id_case_sensitive extends Pancake_Migration {

    public function up() {
        $has_utf8mb4 = $this->db->query("show character set where charset = 'utf8mb4'")->num_rows() > 0;

        $update_column = function ($table, $column = "unique_id") use ($has_utf8mb4) {
            $table = $this->db->dbprefix($table);
            if ($has_utf8mb4) {
                $this->db->query("alter table `$table` change `$column` `$column` varchar(32) character set utf8mb4 collate utf8mb4_bin not null;");
            } else {
                $this->db->query("alter table `$table` change `$column` `$column` varchar(32) character set utf8 collate utf8_bin not null;");
            }
        };

        $update_column("invoices");
        $update_column("clients");
        $update_column("files", "invoice_unique_id");
        $update_column("invoice_rows");
        $update_column("partial_payments");
        $update_column("projects");
        $update_column("proposals");
    }

    public function down() {

    }

}
