<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_days_to_email_templates extends CI_Migration
{
    public function up()
    {
        add_column('email_templates', 'days', 'tinyint', 4, '', TRUE, 'content');
    }

    public function down()
    {

    }
}