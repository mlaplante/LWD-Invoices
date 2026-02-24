<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_gateway_surcharge_again extends CI_Migration
{
    public function up()
	{
		// This is stil missing from mine, somehow? Phil
		add_column('partial_payments', 'gateway_surcharge', 'float', null, 0);
    }
    
    public function down()
	{
	
    }
}