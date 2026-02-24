<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Reserved_11 extends CI_Migration {

    public function up() {
        # This migration does nothing.
        # It is here in order to keep upgrade compatibility between 3.X and 4.X.
       
        # If we released a migration with this number in 3.X and there were a migration
        # with the same number in 4.X, doing stuff, then people upgrading from 3.X wouldn't
        # run it because Pancake only checks migrations by number, and they'd have run
        # a migration with that number in 3.X. So their 4.X migrations wouldn't execute,
        # which means their Pancake wouldn't upgrade correctly.
        
        # This is hacky, but short of rebuilding the migrations system,
        # it's the best solution we have.
        
        # - Bruno
    }

    public function down() {
        
    }

}