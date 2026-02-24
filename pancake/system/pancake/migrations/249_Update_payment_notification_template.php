<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Update_payment_notification_template extends CI_Migration {

    public function up() {
        $admin = "{ipn:first_name} {ipn:last_name} has paid Invoice #{invoice:invoice_number}\n\nThe total paid was {currency:symbol}{ipn:payment_gross}.";
        $client = "Thank you for your payment.\n\nInvoice #{invoice:invoice_number}\nTotal Paid: {currency:symbol}{ipn:payment_gross}\n\nYou may have files available for download. Click here to view your invoice:  {invoice:url}.\n\nThanks,\n{settings:admin_name}";
        $current_admin = trim(array_reset($this->db->select("message")->where('identifier', "invoice_payment_notification_for_admin")->get('email_settings_templates')->row_array()));
        $current_client = trim(array_reset($this->db->select("message")->where('identifier', "invoice_payment_notification_for_client")->get('email_settings_templates')->row_array()));
        $new_admin = "{{client.display_name}} has made a {{gateway.title}} payment for Invoice #{{invoice.invoice_number}}.

The amount paid was: {{ipn.payment_amount}}
{{#invoice.is_paid}}This invoice is now fully paid.{{/invoice.is_paid}}
{{^invoice.is_paid}}This invoice still has {{invoice.unpaid_amount}} outstanding.{{/invoice.is_paid}}";
        $new_client = "Thank you for your payment.

Invoice #{{invoice.invoice_number}}
The amount paid was: {{ipn.payment_amount}}
{{#invoice.is_paid}}This invoice is now fully paid. {{#invoice.has_files}}You have files available for download at: {{invoice.url}}{{/invoice.has_files}}{{/invoice.is_paid}}
{{^invoice.is_paid}}This invoice still has {{invoice.unpaid_amount}} outstanding.{{/invoice.is_paid}}

Thanks,
{{settings.admin_name}}";


        if ($admin === $current_admin) {
            # The template has not been changed, and can be updated.
            $this->db->where('identifier', "invoice_payment_notification_for_admin")->update('email_settings_templates', array("message" => $new_admin));
        }

        if ($client === $current_client) {
            # The template has not been changed, and can be updated.
            $this->db->where('identifier', "invoice_payment_notification_for_client")->update('email_settings_templates', array("message" => $new_client));
        }
    }

    public function down() {

    }

}
