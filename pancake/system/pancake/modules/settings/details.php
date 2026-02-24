<?php defined('BASEPATH') or exit('No direct script access allowed');

class Module_Settings extends Module {

	public $version = '1.0.0';

	public function info()
	{	
		return array(
			'name' => array(
				'english' => 'Settings',
			),
			'description' => array(
				'english' => 'Control various aspects of your sites branding, integration, taxes, etc.',
			),
			'frontend' => TRUE,
			'backend'  => TRUE,
			'menu'	  => NULL,
		);
	}
}
/* End of file details.php */