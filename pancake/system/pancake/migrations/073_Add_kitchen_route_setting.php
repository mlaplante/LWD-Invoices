<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_kitchen_route_setting extends CI_Migration {

    public function up() {
	Settings::create('kitchen_route', 'client_area');
    }

    public function down() {
	Settings::delete('kitchen_route');
    }

}