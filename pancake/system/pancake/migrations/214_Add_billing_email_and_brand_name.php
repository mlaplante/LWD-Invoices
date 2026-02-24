<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_billing_email_and_brand_name extends CI_Migration {

    function up() {
        add_column('business_identities', 'billing_email', 'varchar', 1024, '', false);
        add_column('business_identities', 'brand_name', 'varchar', 1024, '', false);
        add_column('business_identities', 'show_name_along_with_logo', 'tinyint', 1, 0, false);
        
        
        add_column('business_identities', 'billing_email_from', 'varchar', 1024, '', false);
        add_column('business_identities', 'notify_email_from', 'varchar', 1024, '', false);

        $this->db->query("update ".$this->db->dbprefix("business_identities")." set billing_email = notify_email where billing_email = ''");
        $this->db->query("update ".$this->db->dbprefix("business_identities")." set brand_name = site_name where brand_name = ''");
        $this->db->query("update ".$this->db->dbprefix("business_identities")." set billing_email_from = brand_name where billing_email_from = ''");
        $this->db->query("update ".$this->db->dbprefix("business_identities")." set notify_email_from = brand_name where notify_email_from = ''");
        
        $this->db->query("ALTER TABLE ".$this->db->dbprefix("items")." CHANGE `qty` `qty` FLOAT NOT NULL DEFAULT '1'");
        $this->db->query("ALTER TABLE ".$this->db->dbprefix("items")." CHANGE `rate` `rate` FLOAT NOT NULL DEFAULT '0'");
    }

    function down() {
        drop_column('business_identities', 'billing_email');
        drop_column('business_identities', 'brand_name');
        drop_column('business_identities', 'show_name_along_with_logo');
        drop_column('business_identities', 'billing_email_from');
        drop_column('business_identities', 'notify_email_from');
    }

}
