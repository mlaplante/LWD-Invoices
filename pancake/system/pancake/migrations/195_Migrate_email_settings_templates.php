<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Migrate_email_settings_templates extends CI_Migration {

    function up() {

        $email_settings_templates = array(
            'new_invoice' => array(
                'identifier' => 'new_invoice',
                'subject' => "Invoice #{number}",
                'message' => "Hi {invoice:first_name} {invoice:last_name}\n\nYour invoice #{invoice:invoice_number} is ready, after review if you would like to pay it immediately using your credit card (via PayPal) please click <a href=\"{invoice:url}\">{invoice:url}</a>\n\nThanks,\n{settings:admin_name}",
            ),
            'new_estimate' => array(
                'identifier' => 'new_estimate',
                'subject' => "Estimate #{number}",
                'message' => "Hi {estimate:first_name} {estimate:last_name}\n\nYour estimate #{estimate:number} is ready. To review it, please click <a href=\"{estimate:url}\">{estimate:url}</a>.\n\nThanks,\n{settings:admin_name}",
            ),
            'new_proposal' => array(
                'identifier' => 'new_proposal',
                'subject' => "Proposal #{number} - {title}",
                'message' => "Hi {proposal:client_name}\n\nA new proposal is ready for you on {settings:site_name}:\n\n{proposal:url}\n\nThanks,\n{settings:admin_name}",
            ),
            'invoice_payment_notification_for_admin' => array(
                'identifier' => 'invoice_payment_notification_for_admin',
                'subject' => "Received payment for Invoice #{number}",
                'message' => "{ipn:first_name} {ipn:last_name} has paid Invoice #{invoice:invoice_number}\n\nThe total paid was {currency:symbol}{ipn:payment_gross}.",
            ),
            'invoice_payment_notification_for_client' => array(
                'identifier' => 'invoice_payment_notification_for_client',
                'subject' => "Your payment has been received for Invoice #{number}",
                'message' => "Thank you for your payment.\n\nInvoice #{invoice:invoice_number}\nTotal Paid: {currency:symbol}{ipn:payment_gross}\n\nYou may have files available for download. Click here to view your invoice:  {invoice:url}.\n\nThanks,\n{settings:admin_name}\n",
            ),
            'new_ticket' => array(
                'identifier' => 'new_ticket',
                'subject' => "Ticket Received - #{ticket:id}",
                'message' => "Hi {ticket:name}

A new support ticket (#{ticket:id}) has been received on {settings:site_name}:

You may view and update this ticket by clicking <a href=\"{ticket:url}\">here</a>.

Thanks,
{settings:admin_name}",
            ),
            'new_ticket_invoice' => array(
                'identifier' => 'new_ticket_invoice',
                'subject' => "Invoice for Ticket #{ticket:id}",
                'message' => "Hi {ticket:name}

Your invoice <a href=\"{ticket:invoice_url}\">{ticket:invoice_number}</a> for ticket #{ticket:id} is ready. You may review and pay this invoice by going to the following link: <a href=\"{ticket:invoice_url}\">{ticket:invoice_url}</a>.

Thanks,
{settings:admin_name}",
            ),
            'ticket_updated' => array(
                'identifier' => 'ticket_updated',
                'subject' => "Ticket Updated - #{ticket:id}",
                'message' => 'Hi {ticket:name}

Ticket (#{ticket:id}) has been updated on {settings:site_name}:

You may view and update this ticket by clicking <a href="{ticket:url}">here</a>.

Thanks,
{settings:admin_name}',
            ),
            'ticket_status_updated' => array(
                'identifier' => 'ticket_status_updated',
                'subject' => "Ticket Status Updated - #{ticket:id}",
                'message' => 'Hi {ticket:name}

The status of ticket (#{ticket:id}) has been set to {ticket:status} on {settings:site_name}:

You may view and update this ticket by clicking <a href="{ticket:url}">here</a>.

Thanks,
{settings:admin_name}',
            ),
        );

        $settings = array(
            'email_new_invoice' => 'Hi {invoice:first_name} {invoice:last_name}\n\nYour invoice #{invoice:invoice_number} is ready, after review if you would like to pay it immediately using your credit card (via PayPal) please click <a href=\"{invoice:url}\">{invoice:url}</a>\n\nThanks,\n{settings:admin_name}',
            'email_paid_notification' => '{ipn:first_name} {ipn:last_name} has paid Invoice #{invoice:invoice_number}\n\nThe total paid was {currency:symbol}{ipn:payment_gross}.',
            'email_receipt' => 'Thank you for your payment.\n\nInvoice #{invoice:invoice_number}\nTotal Paid: {currency:symbol}{ipn:payment_gross}\n\nYou may have files available for download. Click here to view your invoice:  {invoice:url}.\n\nThanks,\n{settings:admin_name}\n',
            'email_new_proposal' => 'Hi {proposal:client_name}\n\nA new proposal is ready for you on {settings:site_name}:\n\n{proposal:url}\n\nThanks,\n{settings:admin_name}',
            'default_paid_notification_subject' => 'Received payment for Invoice #{number}',
            'email_new_estimate' => 'Hi {estimate:first_name} {estimate:last_name}\n\nYour estimate #{estimate:number} is ready. To review it, please click <a href="{estimate:url}">{estimate:url}</a>.\n\nThanks,\n{settings:admin_name}',
            'default_payment_receipt_subject' => 'Your payment has been received for Invoice #{number}',
            'default_invoice_subject' => 'Invoice #{number}',
            'default_estimate_subject' => 'Estimate #{number}',
            'default_proposal_subject' => 'Proposal #{number} - {title}',
            'default_new_ticket_subject' => 'Ticket Received - #{ticket:id}',
            'email_new_ticket' => 'Hi {ticket:name}\n\nA new support ticket (# {ticket:id}) has been received on {settings:site_name}:\n\nYou may view and update this ticket by visiting {ticket:url}\n\nThanks,\n{settings:admin_name}',
            'default_ticket_updated_subject' => 'Ticket Updated - #{ticket:id}',
            'email_ticket_updated' => 'Hi {ticket:name}\n\nTicket (# {ticket:id}) has been updated on {settings:site_name}:\n\nYou may view and update this ticket by visiting {ticket:url}\n\nThanks,\n{settings:admin_name}',
            'default_ticket_status_updated_subject' => 'Ticket Status Updated - #{ticket:id}',
            'email_ticket_status_updated' => 'Hi {ticket:name}\n\nThe status of ticket (# {ticket:id}) has been set to {ticket:status} on {settings:site_name}:\n\nYou may view and update this ticket by visiting {ticket:url}\n\nThanks,\n{settings:admin_name}',
            'default_new_ticket_invoice_subject' => 'Invoice for Ticket #{ticket:id}',
            'email_new_ticket_invoice' => 'Hi {ticket:name}\n\nYour invoice <a href=\"{ticket:invoice_url}\">{ticket:invoice_number}</a> for ticket # {ticket:id} is ready. You may review and pay this invoice by going to the following link: <a href=\"{ticket:invoice_url}\">{ticket:invoice_url}</a>.\n\nThanks,\n{settings:admin_name}',
        );

        $mapping = array(
            'email_new_invoice' => "new_invoice:message",
            'email_paid_notification' => "invoice_payment_notification_for_admin:message",
            'email_receipt' => "invoice_payment_notification_for_client:message",
            'email_new_proposal' => "new_proposal:message",
            'default_paid_notification_subject' => "invoice_payment_notification_for_admin:subject",
            'email_new_estimate' => "new_estimate:message",
            'default_payment_receipt_subject' => "invoice_payment_notification_for_client:subject",
            'default_invoice_subject' => "new_invoice:subject",
            'default_estimate_subject' => "new_estimate:subject",
            'default_proposal_subject' => "new_proposal:subject",
            'default_new_ticket_subject' => "new_ticket:subject",
            'email_new_ticket' => "new_ticket:message",
            'default_ticket_updated_subject' => "ticket_updated:subject",
            'email_ticket_updated' => "ticket_updated:message",
            'default_ticket_status_updated_subject' => "ticket_status_updated:subject",
            'email_ticket_status_updated' => "ticket_status_updated:message",
            'default_new_ticket_invoice_subject' => "new_ticket_invoice:subject",
            'email_new_ticket_invoice' => "new_ticket_invoice:message"
        );

        foreach ($settings as $key => $value) {

            $value = str_ireplace('\n', "\n", $value);
            $value = str_ireplace('\"', '"', $value);
            $value = trim($value);

            $current_value = trim(Settings::get($key));

            if ($value != $current_value) {
                # Was modified before, so let's migrate it.
                # But first, we check if the new template was modified as well,
                # Because if it was, then the user has already migrated the stuff.

                $template_mapping = explode(':', $mapping[$key]);
                $current_template = array_reset($this->db->select($template_mapping[1])->where('identifier', $template_mapping[0])->get('email_settings_templates')->row_array());

                if ($current_template == $email_settings_templates[$template_mapping[0]][$template_mapping[1]]) {
                    # Not modified, so we can update:
                    $this->db->where('identifier', $template_mapping[0])->update('email_settings_templates', array($template_mapping[1] => $current_value));
                }
            }
        }
    }

    function down() {
        
    }

}
