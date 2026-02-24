<?php

defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2014, Pancake Payments
 * @license		https://pancakeapp.com/license
 * @link		https://pancakeapp.com
 * @since		Version 4.6.0
 */
// ------------------------------------------------------------------------

/**
 * The Clients Credit Alterations Model
 *
 * @subpackage	Models
 * @category	Clients
 */
class Clients_credit_alterations_m extends Pancake_Model {

    protected $table = 'clients_credit_alterations';

    public function get_altered_balance($client_id, $date = null) {
        $this->db->select_sum('amount');
        $this->db->where("client_id", $client_id);
        
        if ($date === null) {
            $date = time();
        }
        
        $date = date("Y-m-d H:i:s", $date);
        $this->db->where("(created_at < ".$this->db->escape($date)." or created_at is null)", null, false);
        
        $result = $this->db->get($this->table)->row_array();
        return $result['amount'];
    }

    public function add($client_id, $amount) {
        $this->db->insert($this->table, array(
            "client_id" => $client_id,
            "amount" => abs($amount),
        ));
    }

    public function remove($client_id, $amount) {
        $this->db->insert($this->table, array(
            "client_id" => $client_id,
            "amount" => abs($amount) * -1,
        ));
    }

}
