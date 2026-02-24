<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_3_2_0_install_issue extends CI_Migration
{

    public function up()
    {
	$this->db->query("CREATE TABLE IF NOT EXISTS ".$this->db->dbprefix('project_files')." (
 `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
 `comment_id` int(11) unsigned NOT NULL,
 `created` int(10) unsigned NOT NULL,
 `orig_filename` varchar(255) NOT NULL,
 `real_filename` TEXT NOT NULL,
 PRIMARY KEY (`id`),
 INDEX comment_id (`comment_id`)
) DEFAULT CHARSET=utf8;");

	$this->db->query("CREATE TABLE IF NOT EXISTS ".$this->db->dbprefix('comments')." (
 `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
 `client_id` int(11) unsigned NOT NULL,
 `user_id` int(11) unsigned NULL,
 `user_name` varchar(255) NOT NULL,
 `created` int(10) unsigned NOT NULL,
 `item_type` varchar(255) NOT NULL,
 `item_id` int(11) NULL,
 `comment` TEXT NOT NULL,
 PRIMARY KEY (`id`),
 INDEX client_id (`client_id`),
 INDEX user_id (`user_id`),
 INDEX item_type (`item_type`),
 INDEX item_id (`item_id`)
) DEFAULT CHARSET=utf8;");

	$this->db->query("CREATE TABLE IF NOT EXISTS ".$this->db->dbprefix('project_updates')." (
 `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
 `project_id` int(11) unsigned NOT NULL,
 `name` varchar(255) NOT NULL,
 `created` int(10) unsigned NOT NULL,
 PRIMARY KEY (`id`),
 INDEX project_id (`project_id`)
) DEFAULT CHARSET=utf8;");
    }

    public function down()
    {
	
    }

}
