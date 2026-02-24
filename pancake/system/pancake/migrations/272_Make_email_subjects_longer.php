<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Make_email_subjects_longer extends Pancake_Migration {

    public function up() {
        # 998 characters because: https://stackoverflow.com/questions/1592291/what-is-the-email-subject-length-limit
        $this->builder->edit_column("contact_log", "subject", "varchar", 998, null, false);
    }

    public function down() {

    }

}
