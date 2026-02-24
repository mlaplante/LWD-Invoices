<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_permissions extends CI_Migration {
    
	public function up()
	{
		$this->db->query('CREATE TABLE IF NOT EXISTS `'.$this->db->dbprefix('permissions').'` (
			  `id` int(11) NOT NULL AUTO_INCREMENT,
			  `group_id` int(11) NOT NULL,
			  `module` varchar(50) COLLATE utf8_unicode_ci NOT NULL,
			  `roles` text COLLATE utf8_unicode_ci,
			  PRIMARY KEY (`id`)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci COMMENT="Contains a list of modules and roles that a group can access.";');
    }
    
	public function down()
	{
		$this->dbforge->drop_table('permissions');
    }
}