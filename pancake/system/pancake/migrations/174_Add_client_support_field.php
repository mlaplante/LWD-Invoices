<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_client_support_field extends CI_Migration
{
    public function up()
    {
        add_column('clients', 'support_user_id', 'int', 10, 0);
    }

    public function down()
    {
		drop_column('clients', 'support_user_id');
   }
}