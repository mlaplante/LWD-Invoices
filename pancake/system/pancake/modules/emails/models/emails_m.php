<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright	Copyright (c) 2010, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * The Email Template Model
 *
 * @subpackage	Models
 * @category	Emails
 */
class Emails_m extends Pancake_Model
{
	/**
	 * @var	string	The name of the clients table
	 */
	protected $table = 'email_templates';

	protected $validate = array(
		array(
			'field'	  => 'type',
			'label'	  => 'lang:contact:type',
			'rules'	  => 'required'
		),
		array(
			'field'	  => 'name',
			'label'	  => 'lang:contact:name',
			'rules'	  => 'required'
		),
		array(
			'field'	  => 'subject',
			'label'	  => 'lang:contact:subject',
			'rules'	  => 'required'
		),

		array(
			'field'	  => 'content',
			'label'	  => 'lang:contact:content',
			'rules'	  => 'required'
		),
	);
	


}

/* End of file: emails_m.php */