<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_permissions_again extends CI_Migration {
    
	public function up()
	{
		if ( ! $this->db->table_exists('permissions'))
		{
			$this->db->query('CREATE TABLE `'.$this->db->dbprefix('permissions').'` (
				  `id` int(11) NOT NULL AUTO_INCREMENT,
				  `group_id` int(11) NOT NULL,
				  `module` varchar(50) COLLATE utf8_unicode_ci NOT NULL,
				  `roles` text COLLATE utf8_unicode_ci,
				  PRIMARY KEY (`id`)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci COMMENT="Contains a list of modules and roles that a group can access.";');
		}
		
		$this->db->query("ALTER TABLE  ".$this->db->dbprefix("partial_payments")." 
			CHANGE  `payment_gross`  `payment_gross` FLOAT DEFAULT NULL,
			CHANGE  `item_name`  `item_name` VARCHAR(255) DEFAULT NULL,
			CHANGE  `is_paid`  `is_paid` tinyint(1) NOT NULL DEFAULT '0',
			CHANGE  `payment_date`  `payment_date` int(11) DEFAULT NULL,
			CHANGE  `payment_type`  `payment_type` VARCHAR(255) DEFAULT NULL,
			CHANGE  `payer_status`  `payer_status` VARCHAR(255) DEFAULT NULL,
			CHANGE  `payment_status`  `payment_status` VARCHAR(255) DEFAULT NULL,
			CHANGE  `payment_method`  `payment_method` VARCHAR(255) DEFAULT NULL
		");
		
		$this->db->query("
		INSERT INTO `".$this->db->dbprefix('permissions')."` (`group_id`, `module`, `roles`) VALUES ('2', 'clients', '{\"view\":\"1\",\"create\":\"1\",\"edit\":\"1\",\"delete\":\"1\"}'), ('2', 'invoices', '{\"create\":\"1\",\"view\":\"1\",\"delete\":\"1\",\"edit\":\"1\",\"send\":\"1\"}'), ('2', 'projects', '{\"create\":\"1\",\"view\":\"1\",\"edit\":\"1\",\"delete\":\"1\",\"add_milestone\":\"1\",\"edit_milestone\":\"1\",\"delete_milestone\":\"1\",\"add_task\":\"1\",\"edit_task\":\"1\",\"delete_task\":\"1\",\"track_time\":\"1\"}'), ('2', 'proposals', '{\"create\":\"1\",\"view\":\"1\",\"edit\":\"1\",\"delete\":\"1\",\"send\":\"1\"}');
		");
		
    }
    
	public function down()
	{
		$this->dbforge->drop_table('permissions');
    }
}