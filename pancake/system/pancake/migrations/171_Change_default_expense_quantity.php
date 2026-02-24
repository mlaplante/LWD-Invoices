<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Change_default_expense_quantity extends CI_Migration {

    public function up() {
        $this->db->query('ALTER TABLE ' . $this->db->dbprefix('project_expenses') . ' CHANGE `qty` `qty` INT(10) NOT NULL DEFAULT 1');

        $this->db
            ->where('qty', 0)
            ->update('project_expenses', array('qty' => 1));
    }

    public function down() {

    }

}
