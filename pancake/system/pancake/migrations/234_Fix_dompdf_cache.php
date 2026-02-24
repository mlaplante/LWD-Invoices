<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_dompdf_cache extends CI_Migration {

    function up() {
        # Fixes an issue that can happen if updating to a Pancake later than [schema:238] from a version earlier than [schema:234].
        $this->db->query("ALTER TABLE ".$this->db->dbprefix("settings")." CHANGE `value` `value` LONGTEXT  CHARACTER SET utf8  NULL");

        $this->load->model("upgrade/update_system_m");
        $old_filename = APPPATH."libraries/dompdf/lib/fonts/dompdf_font_family_cache.php";
        $new_filename = APPPATH."libraries/dompdf/lib/fonts/dompdf_font_family_cache.bak.php";

        if (file_exists($old_filename)) {
            $this->update_system_m->set_file_contents($new_filename, file_get_contents($old_filename));
            $this->update_system_m->delete($old_filename);
        }
    }

    function down() {

    }

}
