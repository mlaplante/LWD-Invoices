<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_api_key_note_field extends CI_Migration
{

    public function up()
    {
	$table = 'keys';
	$name = 'notes';
	
	$result = $this->db->query("SHOW COLUMNS FROM " . $this->db->dbprefix($table) . " LIKE '{$name}'")->row_array();
	if (!isset($result['Field']) or $result['Field'] != $name) {
	    # Field does not exist. add note if it doesn't exist.
	    add_column('keys', 'note', 'varchar', 255, '');
	} else {
	    # Field exists, rename to note.
	    $this->db->query('ALTER TABLE '.$this->db->dbprefix($table).' CHANGE  `notes`  `note` VARCHAR( 255 ) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL');
	}
    }

    public function down()
    {
	
    }

}