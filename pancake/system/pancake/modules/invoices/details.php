<?php defined('BASEPATH') or exit('No direct script access allowed');

class Module_Invoices extends Module {

	public $version = '1.0';

	public function info()
	{	
		return array(
			'name' => array(
				'english' => __('global:invoices'),
			),
			'description' => array(
				'english' => __('global:create_invoice_estimate'),
			),
			'frontend' => TRUE,
			'backend'  => TRUE,
			'menu'	  => 'invoices',
			
			'roles' => array(
				'create', 'view', 'delete', 'edit', 'send',
			),
			
		    'shortcuts' => $this->method == 'estimates'
		
				// Estimate links
				? array(
					array(
					    'name' => 'estimates:createnew',
					    'uri' => 'admin/estimates/create_estimate',
					    'class' => 'add',
					),
			    )
			
				// Invoice links
				: array(
					array(
					    'name' => 'global:createinvoice',
					    'uri' => 'admin/invoices/create',
					    'class' => 'add',
						'li_class'	=>	'generate-invoice',
					),
			    ),
		);
	}
}
/* End of file details.php */