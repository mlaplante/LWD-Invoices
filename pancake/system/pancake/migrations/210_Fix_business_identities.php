<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_business_identities extends CI_Migration {

    function up() {

        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix("business_identities") . " (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `site_name` varchar(1024) NOT NULL DEFAULT '',
  `admin_name` varchar(1024) NOT NULL DEFAULT '',
  `mailing_address` varchar(1024) NOT NULL DEFAULT '',
  `notify_email` varchar(1024) NOT NULL DEFAULT '',
  `logo_filename` varchar(1024) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;");

        add_column("clients", "business_identity", "int", 255, null, true);

        if ($this->db->count_all("business_identities") == 0) {

            # Look for the relative path to the logo (e.g. /uploads/branding/logofilename.png).
            $matches = array();
            preg_match("/^http(?:.*)\/uploads\/(.*)$/i", Settings::get("logo_url"), $matches);
            if (isset($matches[1])) {
                $relative_logo_url = "uploads/" . $matches[1];
            } else {
                # Couldn't find the relative path, so store the absolute path just so that data isn't lost.
                $relative_logo_url = Settings::get("logo_url");
            }

            $this->db->insert("business_identities", array(
                "site_name" => Settings::get("site_name"),
                "admin_name" => Settings::get("admin_name"),
                "mailing_address" => Settings::get("mailing_address"),
                "notify_email" => Settings::get("notify_email"),
                "logo_filename" => $relative_logo_url,
            ));
        }
    }

    function down() {
    }

}
