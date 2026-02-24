<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_proposal_estimate_notifications extends CI_Migration {

    function up() {
        foreach (["proposal", "estimate"] as $type) {
            foreach (["accepted", "rejected"] as $action) {
                $capitalized_type = ucwords($type);
                $capitalized_action = ucwords($action);

                if ($this->db->where("identifier", $type . "_" . $action)->count_all_results("email_settings_templates") == 0) {
                    $this->db->insert("email_settings_templates", array(
                        "identifier" => $type . "_" . $action,
                        "subject" => $capitalized_type . " #{number} " . $capitalized_action,
                        "message" => <<<message
$capitalized_type #{number} was $action.

You can review it at: <a href="{{$type}:url}">{{$type}:url}</a>
message
                        ,
                        "type" => "html",
                        "template" => "default",
                        "date_updated" => date('Y-m-d H:i:s'),
                    ));
                }
            }
        }
    }

    function down() {
        foreach (["proposal", "estimate"] as $type) {
            foreach (["accepted", "rejected"] as $action) {
                $this->db->where("identifier", $type . "_" . $action)->delete("email_settings_templates");
            }
        }
    }

}
