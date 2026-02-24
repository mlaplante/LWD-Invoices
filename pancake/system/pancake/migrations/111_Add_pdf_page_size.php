<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_pdf_page_size extends CI_Migration {
    function up() {
        Settings::create('pdf_page_size', 'A4');
    }
    
    function down() {
        Settings::delete('pdf_page_size');
    }
}