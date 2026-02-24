<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Insert_default_email_template extends CI_Migration
{
    public function up()
    {
    	$content = 'Your invoice #{invoice:invoice_number} is due, please review as soon as possible. If you would like to pay it immediately using your credit card (via PayPal) please click <a href=\"{invoice:url}\">{invoice:url}</a>\n\nThanks,\n{settings:admin_name}';

    	$content = str_replace(array('\n', '\"'), array("\n", '"'), $content);
    	
		$this->db->insert('email_templates', array(
			'type' => 'invoice',
			'name' => 'Friendly Reminder',
			'subject' => 'Reminder for invoice #{invoice:invoice_number}',
			'content' => $content,
			'days' => 14,
			'created' => 0,
		));
    }

    public function down()
    {

    }
}