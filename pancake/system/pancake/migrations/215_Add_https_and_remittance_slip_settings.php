<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_https_and_remittance_slip_settings extends CI_Migration {

    function up() {
        Settings::create("always_https", 0);
        Settings::create("remittance_slip", "<h2>How to Pay</h2>

View invoice online at:
{{invoice.url}}

You may pay in person, online, or by mail using this payment voucher. Please provide your payment information below.

Enclosed Amount: __________________________________");
        
        $this->db->insert("email_settings_templates", array(
            "identifier" => "client_area_details",
            "subject" => "Your Client Area Details",
            "message" => <<<message
Hi {{client.first_name}} {{client.last_name}},

You can access your client area at: <a href="{{client.access_url}}">{{client.access_url}}</a>

Your email is: {{client.email}}
{{#client.passphrase}}Your password is: {{client.passphrase}}{{/client.passphrase}}
{{^client.passphrase}}You don't need to enter a password.{{/client.passphrase}}

Thanks,
{{settings.admin_name}}
message
            ,
            "type" => "html",
            "template" => "default",
            "date_updated" => date('Y-m-d H:i:s')
        ));
    }

    function down() {
        Settings::delete("always_https");
        Settings::delete("remittance_slip");
    }

}
