<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_client_ticket_rate extends CI_Migration
{
    public function up()
	{
		add_column('clients', 'priority_ticket_rate', 'float', null, 0);
    }
    
    public function down()
	{
		drop_column('clients', 'priority_ticket_rate');
    }
}