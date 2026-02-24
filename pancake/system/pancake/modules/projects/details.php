<?php defined('BASEPATH') or exit('No direct script access allowed');

class Module_Projects extends Module
{
	public $version = '1.0';

	public function info()
	{
		return array(
			'name' => array(
				'english' => 'Projects',
			),
			'description' => array(
				'english' => 'Track milestones, tasks and time for various projects.',
			),
			'frontend' => TRUE,
			'backend'  => TRUE,
			'menu'	  => 'projects',

			'roles' => array(
				'create', 'view', 'edit', 'delete',
				'add_milestone', 'edit_milestone', 'delete_milestone', 'add_task', 'edit_task', 'delete_task', 'track_time',
			),

		    'shortcuts' => array(
				array(
				  'name' => 'projects:add',
				  'uri' => 'admin/projects/create',
				  'li_class' => 'add',
				  'class' => 'create-project fire-ajax',
					'id' => 'create_project',
				),
				array(
					'name' => 'projects:createfromtemplate',
					'uri' => 'admin/projects/templates',
					'li_class' => 'add',
					'class' => 'create-project-template fire-ajax',
					'id' => 'create_from_project'
				),
			),
		);
	}
}
/* End of file details.php */