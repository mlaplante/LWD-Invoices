<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_private_to_comments extends CI_Migration
{
    public function up()
    {
        add_column('comments', 'is_private', 'tinyint', 1, 0);
    }

    public function down()
    {

    }
}