<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Update_client_area_email_template extends CI_Migration {

    function up() {
        $old_template = <<<message
Hi {{client.first_name}} {{client.last_name}},

You can access your client area at: <a href="{{client.access_url}}">{{client.access_url}}</a>

{{#client.passphrase}}Your passphrase is: {{client.passphrase}}{{/client.passphrase}}

Thanks,
{{settings.admin_name}}
message;

        $new_template = <<<message
Hi {{client.first_name}} {{client.last_name}},

You can access your client area at: <a href="{{client.access_url}}">{{client.access_url}}</a>

Your email is: {{client.email}}
{{#client.passphrase}}Your password is: {{client.passphrase}}{{/client.passphrase}}
{{^client.passphrase}}You don't need to enter a password.{{/client.passphrase}}

Thanks,
{{settings.admin_name}}
message;

        $current_template = $this->db->where("identifier", "client_area_details")->get("email_settings_templates")->row_array();

        if (str_ireplace(array("\n", " "), "", trim($current_template['message'])) == str_ireplace(array("\n", " "), "", trim($old_template))) {
            # The current template is the same as the original template. It can be updated without any loss of detail.
            $this->db->where("identifier", "client_area_details")->update("email_settings_templates", array(
                "message" => $new_template
            ));
        }
    }

    function down() {

    }

}
