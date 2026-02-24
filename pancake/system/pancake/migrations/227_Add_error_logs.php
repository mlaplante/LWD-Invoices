<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_error_logs extends CI_Migration {

    function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('error_logs') . " (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `subject` varchar(1024) NOT NULL DEFAULT '',
  `occurrences` int(11) NOT NULL DEFAULT '1',
  `first_occurrence` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `latest_occurrence` timestamp null default null,
  `contents` longtext NOT NULL,
  `is_reported` tinyint(1) NOT NULL DEFAULT '0',
  `notification_email` varchar(1024) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

}
