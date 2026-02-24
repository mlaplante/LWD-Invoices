<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_client_meta_credit_and_taxes extends CI_Migration {

    function up() {
        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('clients_credit_alterations') . " (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `amount` decimal(65,10) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;");

        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('clients_meta') . " (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `label` varchar(1024) NOT NULL DEFAULT '',
  `slug` varchar(1024) NOT NULL DEFAULT '',
  `value` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;");

        $this->db->query("CREATE TABLE IF NOT EXISTS " . $this->db->dbprefix('clients_taxes') . " (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `tax_id` int(5) unsigned NOT NULL,
  `tax_registration_id` varchar(1024) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;");
    }

}
