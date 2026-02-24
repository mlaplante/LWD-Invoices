<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_allowed_extensions extends CI_Migration {
    function up() {
        Settings::create('allowed_extensions', 'pdf,png,psd,jpg,jpeg,bmp,ai,txt,zip,rar,7z,gzip,bzip,gz,gif,doc,docx,ppt,pptx,xls,xlsx,csv');
    }
    
    function down() {
        Settings::delete('allowed_extensions');
    }
}