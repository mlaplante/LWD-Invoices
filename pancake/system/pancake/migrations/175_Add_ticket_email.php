<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_ticket_email extends CI_Migration {

    public function up()
	{
		$this->db->replace('settings', array(
			'slug' => 'default_new_ticket_subject',
			'value' => "Ticket Received - #{ticket:id}"
		));

		$this->db->replace('settings', array(
			'slug' => 'email_new_ticket',
			'value' => "Hi {ticket:name}\n\nA new support ticket (# {ticket:id}) has been received on {settings:site_name}:\n\nYou may view and update this ticket by visiting {ticket:url}\n\nThanks,\n{settings:admin_name}"
		));

		$this->db->replace('settings', array(
			'slug' => 'default_ticket_updated_subject',
			'value' => "Ticket Updated - #{ticket:id}"
		));

		$this->db->replace('settings', array(
			'slug' => 'email_ticket_updated',
			'value' => "Hi {ticket:name}\n\nTicket (# {ticket:id}) has been updated on {settings:site_name}:\n\nYou may view and update this ticket by visiting {ticket:url}\n\nThanks,\n{settings:admin_name}"
		));

		$this->db->replace('settings', array(
			'slug' => 'default_ticket_status_updated_subject',
			'value' => "Ticket Status Updated - #{ticket:id}"
		));

		$this->db->replace('settings', array(
			'slug' => 'email_ticket_status_updated',
			'value' => "Hi {ticket:name}\n\nThe status of ticket (# {ticket:id}) has been set to {ticket:status} on {settings:site_name}:\n\nYou may view and update this ticket by visiting {ticket:url}\n\nThanks,\n{settings:admin_name}"
		));

    }

    public function down()
	{
	    $this->db
			->where('slug', 'email_new_ticket')
			->delete('settings');

		$this->db
			->where('slug', 'email_ticket_updated')
			->delete('settings');

		$this->db
			->where('slug', 'email_ticket_status_updated')
			->delete('settings');
	}
}