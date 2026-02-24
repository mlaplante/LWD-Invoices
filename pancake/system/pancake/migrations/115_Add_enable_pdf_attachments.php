<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_enable_pdf_attachments extends CI_Migration {
    function up() {
        Settings::create('enable_pdf_attachments', 1);
    }
    
    function down() {
        Settings::delete('enable_pdf_attachments');
    }
}