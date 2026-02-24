<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_more_default_subjects extends CI_Migration {
    function up() {
        Settings::create('default_paid_notification_subject', 'Your payment has been received for Invoice #{number}');
        Settings::create('default_payment_receipt_subject', 'Received payment for Invoice #{number}');
    }
    
    function down() {
        Settings::delete('default_paid_notification_subject');
        Settings::delete('default_payment_receipt_subject');
    }
}