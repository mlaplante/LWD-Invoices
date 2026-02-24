<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_credit_note_email_template extends CI_Migration {

    function up() {
        $this->db->insert("email_settings_templates", array(
            "identifier" => "new_credit_note",
            "subject" => "Credit Note #{number}",
            "message" => <<<message
Hi {credit_note:first_name} {credit_note:last_name}

Your credit note #{credit_note:number} is ready. To review it, please click <a href=\"{credit_note:url}\">{credit_note:url}</a>.

Thanks,
{settings:admin_name}
message
            ,
            "type" => "html",
            "template" => "default",
            "date_updated" => date('Y-m-d H:i:s')
        ));
    }

    function down() {
        $this->db->where("identifier", "new_credit_note")->delete("email_settings_templates");
    }

}
