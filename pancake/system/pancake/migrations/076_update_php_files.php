<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Update_php_files extends CI_Migration {
    function up() {
	$table = $this->db->dbprefix('project_files');
        $results = $this->db->query("SELECT *  FROM $table WHERE `real_filename` LIKE '%.php'")->result_array();
	foreach ($results as $row) {
	    $path = FCPATH.'uploads/'.$row['real_filename'];
	    @rename($path, $path.'.txt');
	}
	$this->db->query("UPDATE $table SET  real_filename = CONCAT(real_filename, '.txt') WHERE `real_filename` LIKE '%.php'");
	$this->db->query("UPDATE $table SET  orig_filename = CONCAT(orig_filename, '.txt') WHERE `orig_filename` LIKE '%.php'");
    }
    
    function down() {
        
    }
}