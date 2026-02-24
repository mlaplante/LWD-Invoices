<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2010, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link           http://pancakeapp.com
 * @since          Version 1.0
 */
// ------------------------------------------------------------------------

/**
 * The Clients Support Matrix Model
 *
 * @subpackage    Models
 * @category      Clients
 */
class Client_support_rates_matrix_m extends Pancake_Model {

    /**
     * @var    string    The name of the clients table
     */
    protected $table = 'client_ticket_support_rate_matrix';
    protected $validate = array(
        array(
            'field' => 'client_id',
            'label' => 'Client ID',
            'rules' => 'required',
        ),
        array(
            'field' => 'priority_id',
            'label' => 'Priority ID',
            'rules' => 'required',
        ),
        array(
            'field' => 'rate',
            'label' => 'Rate',
            'rules' => 'required',
        ),
    );

    /**
     * Retreive Ticket support rate matrix by client id
     *
     * @access public
     *
     * @param string $client_id ID of the client
     *
     * @return array
     */
    public function byClientId($id) {
        return $this->db
            ->select("client_ticket_support_rate_matrix.*, ticket_priorities.title")
            ->where('client_id', $id)
            ->join("ticket_priorities", "ticket_priorities.id = priority_id", "left")
            ->get($this->table)
            ->result();
    }

    function is_billable($priority_id, $client_id) {
        $has_custom_rate = $this->db->where("client_id", $client_id)->where("priority_id", $priority_id)->count_all_results("client_ticket_support_rate_matrix") > 0;

        if ($has_custom_rate) {
            # Found a specific rate for this client, so use that rate.
            return $this->db->where("client_id", $client_id)->where("priority_id", $priority_id)->where("rate >", 0)->count_all_results("client_ticket_support_rate_matrix") > 0;
        } else {
            # Didn't find a specific rate for this client, so use the default rate.
            return $this->db->where("id", $priority_id)->where("default_rate >", 0)->count_all_results("ticket_priorities") > 0;
        }
    }

    function getDropdown($client_id) {
        $buffer = $this->byClientId($client_id);

        $return = array();
        foreach ($buffer as $row) {
            $title = $row->title;
            if ($row->rate) {
                $title = "$title - " . Currency::format($row->rate);
            }
            $return[$row->priority_id] = $title;
        }

        if (empty($return)) {
            # No rates; use the defaults:
            $CI = get_instance();
            $CI->load->model("tickets/ticket_priorities_m");
            return $CI->ticket_priorities_m->getDropdown();
        }

        return $return;
    }

    function getByClientIdAndPriorityId($client_id, $priority_id) {
        $result = $this->db->select('client_id, priority_id, rate')->where('client_id', $client_id)->where('priority_id', $priority_id)->get($this->table)->row_array();

        if (!isset($result['rate'])) {
            $result = $this->db->where("id", $priority_id)->get("ticket_priorities")->row_array();
            if (!isset($result['default_rate'])) {
                return array();
            } else {
                return array(
                    'client_id' => $client_id,
                    'priority_id' => $priority_id,
                    'rate' => $result['default_rate'],
                );
            }
        } else {
            return $result;
        }
    }

    /**
     * Delete Ticket support rate matrix by client id
     *
     * @access public
     *
     * @param string $client_id ID of the client
     *
     * @return array
     */
    public function delete($id) {
        return $this->db->where('client_id', $id)->delete($this->table);
    }

    /**
     * Inserts / Updates Priority matrix for client
     *
     * @access public
     *
     * @param string $client_id ID of the client
     * @param array  $data      priority rates matrix data
     *
     * @return int
     */
    public function store($client_id, $data) {
        $this->delete($client_id);

        foreach ($data as $k => $priority) {
            $priority = array('client_id' => $client_id, 'priority_id' => $k, 'rate' => $priority['rate'], 'tax_id' => $priority['tax_id']);
            parent::insert($priority);
        }
        return true;
    }

}
