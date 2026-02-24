<?php defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_gateway_surcharge extends CI_Migration
{
    public function up()
	{
        $this->db->insert('gateway_fields', array(
        	'gateway' => 'paypal_m',
			'field' => 'paypal_fee',
			'type' => 'FIELD',
			'value' => "",
        ));

		add_column('partial_payments', 'gateway_surcharge', 'float', NULL, NULL, TRUE);
			
		$notification = $this->db->get_where('settings', array(
			'slug' => 'email_paid_notification',
		))->row()->value;
		
		$notification = str_replace('${ipn:payment_gross}', '{currency:code} {ipn:payment_gross}', $notification);
		
		$this->db->where('slug', 'email_paid_notification')->update('settings', array(
			'value' => $notification,
		));
    }
    
    public function down()
	{
		$this->db->delete('gateway_fields', array(
        	'field' => 'paypal_fee',
        ));

		$this->db->query("ALTER TABLE  ".$this->db->dbprefix("partial_payments")." 
			DROP  `gateway_surcharge`");
    }
}