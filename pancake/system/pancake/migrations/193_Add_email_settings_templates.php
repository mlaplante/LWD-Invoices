<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_email_settings_templates extends CI_Migration {

    function up() {

        $this->dbforge->add_field(array(
            'id' => array('type' => 'int', 'constraint' => 11, 'auto_increment' => true),
            'identifier' => array('type' => 'varchar', 'constraint' => 255),
            'subject' => array('type' => 'varchar', 'constraint' => 255),
            'message' => array('type' => 'text'),
            'type' => array('type' => 'varchar', 'constraint' => 255), # html / plaintext / markdown
            'template' => array('type' => 'varchar', 'constraint' => 255, 'default' => 'default'),
            'date_added' => array('type' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
            'date_updated' => array('type' => 'datetime'),
        ));

        $this->dbforge->add_key('id', true);
        $this->dbforge->create_table('email_settings_templates', true);

        $this->db->insert_batch('email_settings_templates', array(
            array(
                'identifier' => 'new_invoice',
                'subject' => "Invoice #{number}",
                'message' => "Hi {invoice:first_name} {invoice:last_name}\n\nYour invoice #{invoice:invoice_number} is ready, after review if you would like to pay it immediately using your credit card (via PayPal) please click <a href=\"{invoice:url}\">{invoice:url}</a>\n\nThanks,\n{settings:admin_name}",
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'new_estimate',
                'subject' => "Estimate #{number}",
                'message' => "Hi {estimate:first_name} {estimate:last_name}\n\nYour estimate #{estimate:number} is ready. To review it, please click <a href=\"{estimate:url}\">{estimate:url}</a>.\n\nThanks,\n{settings:admin_name}",
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'new_proposal',
                'subject' => "Proposal #{number} - {title}",
                'message' => "Hi {proposal:client_name}\n\nA new proposal is ready for you on {settings:site_name}:\n\n{proposal:url}\n\nThanks,\n{settings:admin_name}",
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'invoice_payment_notification_for_admin',
                'subject' => "Received payment for Invoice #{number}",
                'message' => "{ipn:first_name} {ipn:last_name} has paid Invoice #{invoice:invoice_number}\n\nThe total paid was {currency:symbol}{ipn:payment_gross}.",
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'invoice_payment_notification_for_client',
                'subject' => "Your payment has been received for Invoice #{number}",
                'message' => "Thank you for your payment.\n\nInvoice #{invoice:invoice_number}\nTotal Paid: {currency:symbol}{ipn:payment_gross}\n\nYou may have files available for download. Click here to view your invoice:  {invoice:url}.\n\nThanks,\n{settings:admin_name}\n",
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'new_ticket',
                'subject' => "Ticket Received - #{ticket:id}",
                'message' => "Hi {ticket:name}

A new support ticket (#{ticket:id}) has been received on {settings:site_name}:

You may view and update this ticket by clicking <a href=\"{ticket:url}\">here</a>.

Thanks,
{settings:admin_name}",
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'new_ticket_invoice',
                'subject' => "Invoice for Ticket #{ticket:id}",
                'message' => "Hi {ticket:name}

Your invoice <a href=\"{ticket:invoice_url}\">{ticket:invoice_number}</a> for ticket #{ticket:id} is ready. You may review and pay this invoice by going to the following link: <a href=\"{ticket:invoice_url}\">{ticket:invoice_url}</a>.

Thanks,
{settings:admin_name}",
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'ticket_updated',
                'subject' => "Ticket Updated - #{ticket:id}",
                'message' => 'Hi {ticket:name}

Ticket (#{ticket:id}) has been updated on {settings:site_name}:

You may view and update this ticket by clicking <a href="{ticket:url}">here</a>.

Thanks,
{settings:admin_name}',
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'ticket_status_updated',
                'subject' => "Ticket Status Updated - #{ticket:id}",
                'message' => 'Hi {ticket:name}

The status of ticket (#{ticket:id}) has been set to {ticket:status} on {settings:site_name}:

You may view and update this ticket by clicking <a href="{ticket:url}">here</a>.

Thanks,
{settings:admin_name}',
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'assigned_to_task',
                'subject' => "You've been assigned to a task in {project:name}!",
                'message' => "Task Name: {task:name}\n"
                . "Project: {project:name}\n"
                . "Task Status: {task:status}\n"
                . "Due Date: {task:due_date}\n"
                . "Projected Hours: {task:projected_hours}\n\n"
                . "{task:notes}\n",
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'assigned_to_milestone',
                'subject' => "You've been assigned to a milestone in {project:name}!",
                'message' => "Milestone Name: {milestone:name}\n"
                . "Project: {project:name}\n"
                . "Target Date: {milestone:target_date}\n\n"
                . "{milestone:description}\n",
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
            array(
                'identifier' => 'new_comment',
                'subject' => "{comment:user_name} commented on {item}",
                'message' => '{comment:user_name}\'s comment follows:

---

{comment:comment}

---

You can reply to this comment by clicking <a href="{comment:url}">here</a>.',
                'type' => 'html',
                'date_updated' => date('Y-m-d H:i:s')
            ),
        ));
    }

}
