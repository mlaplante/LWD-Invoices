<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_logo_width_and_height extends CI_Migration {

    public function up() {
        add_column("business_identities", "logo_width", "unsigned_int", 11, null, true);
        add_column("business_identities", "logo_height", "unsigned_int", 11, null, true);

        $unmigrated_logos = $this->db->select("id, logo_filename")->where("logo_filename !=", "")->where("logo_width is null", null)->get("business_identities")->result_array();
        foreach ($unmigrated_logos as $logo) {
            $path = FCPATH . urldecode($logo["logo_filename"]);
            if (file_exists($path)) {
                $details = getimagesize($path);
                $this->db->where("id", $logo["id"])->update("business_identities", [
                    "logo_width" => $details[0],
                    "logo_height" => $details[1],
                ]);
            } else {
                # Remove the logo record; the file doesn't exist anymore.
                $this->db->where("id", $logo["id"])->update("business_identities", [
                    "logo_filename" => "",
                ]);
            }
        }
    }

    public function down() {

    }

}
