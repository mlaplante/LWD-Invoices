<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_ticket_invoice_message_setting extends CI_Migration {

    public function up()
	{
		$this->db->replace('settings', array(
			'slug' => 'default_new_ticket_invoice_subject',
			'value' => "Invoice for Ticket #{ticket:id}"
		));


		$this->db->replace('settings', array(
			'slug' => 'email_new_ticket_invoice',
			'value' => "Hi {ticket:name}\n\nYour invoice <a href=\"{ticket:invoice_url}\">{ticket:invoice_number}</a> for ticket # {ticket:id} is ready. You may review and pay this invoice by going to the following link: <a href=\"{ticket:invoice_url}\">{ticket:invoice_url}</a>.\n\nThanks,\n{settings:admin_name}"
		));
	}

	public function down()
	{
		$this->db
			->where('slug', 'default_new_ticket_invoice_subject')
			->delete('settings');
		
		$this->db
			->where('slug', 'email_new_ticket_invoice')
			->delete('settings');

	}

}