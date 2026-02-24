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
 * The Client Contact Model
 *
 * @subpackage	Models
 * @category	Clients
 */
class Contact_m extends Pancake_Model
{
	/**
	 * @var	string	The name of the clients table
	 */
	protected $table = 'contact_log';

	protected $validate = array(
		array(
			'field'	  => 'contact',
			'label'	  => 'lang:contact:contact',
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

        public function get_contact($contact_id) {
            return $this->db->where('id', $contact_id)->get('contact_log')->row_array();
        }

	public function get_recent_contact($client_id)
	{
		return $this->db
			->select(''.$this->db->dbprefix('contact_log').'.id, contact, method, subject, sent_date, duration, meta.user_id, CONCAT('.$this->db->dbprefix('meta').'.first_name, " ", '.$this->db->dbprefix('meta').'.last_name) as user_name', false)
			->order_by('sent_date', 'desc')
			->where('client_id', $client_id)
			->join('meta', 'meta.user_id = contact_log.user_id', 'left')
			->get('contact_log')
			->result();
	}
}

/* End of file: settings_m.php */