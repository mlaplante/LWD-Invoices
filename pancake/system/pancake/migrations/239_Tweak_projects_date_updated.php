<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Tweak_projects_date_updated extends CI_Migration {

    function up() {
        $result = $this->db->query("SHOW COLUMNS FROM " . $this->db->dbprefix('projects') . " LIKE 'date_updated'")->row_array();

        if (isset($result['Field']) && $result['Type'] != "timestamp") {
            # Allow nulls and dates, not just numbers.
            $this->db->query("ALTER TABLE `" . $this->db->dbprefix("projects") . "` CHANGE `date_updated` `date_updated` VARCHAR(30)  NULL DEFAULT NULL;");

            # Change all the 0s to NULL.
            $this->db->where("date_updated", "0")->update("projects", array(
                "date_updated" => null
            ));

            # Change all the timestamps to proper dates.
            $this->db->query("update `" . $this->db->dbprefix("projects") . "` set date_updated = from_unixtime(date_updated) where date_updated > 0");

            # Change it to a timestamp field.
            $this->db->query("ALTER TABLE  `" . $this->db->dbprefix("projects") . "` CHANGE date_updated date_updated TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP");
        }


    }

    function down() {

    }

}
