<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_notification_id extends CI_Migration {
    function up() {
        $this->db->where('notification_id', 0)->delete('hidden_notifications');
        $this->db->query("ALTER TABLE  ".$this->db->dbprefix("hidden_notifications")." CHANGE  `notification_id`  `notification_id` VARCHAR(255) DEFAULT NULL");
    }
    
    function down() {
        
    }
}