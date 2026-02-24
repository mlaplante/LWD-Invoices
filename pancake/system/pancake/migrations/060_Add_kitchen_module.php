<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_kitchen_module extends CI_Migration {
    
	public function up()
	{
		add_column('clients', 'unique_id', 'varchar', 10, 0);
		add_column('clients', 'passphrase', 'varchar', 32, '');
		add_column('projects', 'is_viewable', 'tinyint', 1, 0);
		add_column('project_milestones', 'is_viewable', 'tinyint', 1, 0);
		add_column('project_tasks', 'is_viewable', 'tinyint', 1, 0);

		// Loop through all clients and set a unique id.
		$this->load->model('clients/clients_m');
		$clients = $this->clients_m->get_all();
		if($clients)
		{
			foreach($clients as $client)
			{
				$this->clients_m->reset_unique_id($client->id);
			}
		}
    }
    
	public function down()
	{
		$this->dbforge->remove_column('clients', 'unique_id');
		$this->dbforge->remove_column('clients', 'passphrase');
		$this->dbforge->remove_column('projects', 'is_viewable');
		$this->dbforge->remove_column('project_milestones', 'is_viewable');
		$this->dbforge->remove_column('project_tasks', 'is_viewable');
    }
}