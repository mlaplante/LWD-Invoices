<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_is_compound extends CI_Migration {

    function up() {
        add_column("taxes", "is_compound", "bool", null, 0, false);
    }

    function down() {
        drop_column("taxes", "is_compound");
    }

}
