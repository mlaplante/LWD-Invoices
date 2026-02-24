<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_send_x_days_before extends CI_Migration
{

    public function up()
    {
	Settings::create('send_x_days_before', 7);
    }

    public function down()
    {
	
    }

}
