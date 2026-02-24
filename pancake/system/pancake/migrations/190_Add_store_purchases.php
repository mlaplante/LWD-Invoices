<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_store_purchases extends CI_Migration {

    function up() {
        
        Settings::create("store_auth_token", "");
        Settings::create("store_auth_email", "");
        
        $this->dbforge->add_field(array(
            'id' => array('type' => 'int', 'constraint' => 11, 'auto_increment' => true),
            'plugin_unique_id' => array('type' => 'varchar', 'constraint' => 255),
            'plugin_title' => array('type' => 'varchar', 'constraint' => 255),
            'plugin_type_id' => array('type' => 'varchar', 'constraint' => 255),
            'filepath' => array('type' => 'text'),
            'current_version' => array('type' => 'varchar', 'constraint' => 255),
            'latest_version' => array('type' => 'varchar', 'constraint' => 255),
            'changelog_since_current_version' => array('type' => 'longtext'),
            'date_added' => array('type' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
        ));

        $this->dbforge->add_key('id', true);
        $this->dbforge->create_table('store_purchases', true);
        
    }

}