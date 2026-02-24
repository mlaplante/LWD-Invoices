<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_new_email_settings extends CI_Migration {
    function up() {
        Settings::create('email_new_estimate', 'Hi {estimate:first_name} {estimate:last_name}

Your estimate #{estimate:number} is ready. To review it, please click <a href="{estimate:url}">{estimate:url}</a>.

Thanks,
{settings:admin_name}');
        Settings::create('default_invoice_subject', 'Invoice #{number}');
        Settings::create('default_estimate_subject', 'Estimate #{number}');
        Settings::create('default_proposal_subject', 'Proposal #{number} - {title}');
    }
    
    function down() {
        Settings::delete('items_per_page');
        Settings::delete('default_invoice_subject');
        Settings::delete('default_estimate_subject');
        Settings::delete('default_proposal_subject');
    }
}