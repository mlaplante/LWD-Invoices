<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_ticket_priority_default_rates extends CI_Migration
{
    public function up()
	{
		add_column('ticket_priorities', 'default_rate', 'float', null, 0);
		drop_column('clients', 'priority_ticket_rate');
    }
    
    public function down()
	{
		drop_column('ticket_priorities ', 'default_rate');
    }
}