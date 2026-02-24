<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_improved_col extends CI_Migration {
    function up() {
        add_column('partial_payments', 'improved', 'int', 1, 1);
    }
    
    function down() {
        
    }
}