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
 * The Item Model
 *
 * @subpackage    Models
 * @category      Items
 */
class Ticket_history_m extends Pancake_Model {

    protected $table = 'ticket_history';

    public function get_status(&$history) {
        $this->load->model('ticket_statuses_m');
        $history->status = $this->ticket_statuses_m->get($history->status_id);
    }

    public function insert($data, $skip_validation = false) {
        $result = parent::insert($data, $skip_validation);
        if ($result) {
            if (!in_array($data["ticket_id"], $this->ticket_m->created_during_this_request)) {
                if (isset($data["user_id"]) && $data["user_id"] > 0) {
                    Notify::user_updated_ticket_status($result, $data["user_id"]);
                } else {
                    Notify::client_updated_ticket_status($result, $this->ticket_m->get_client_id_by_id($data["ticket_id"]));
                }
            }

            # This will generate an invoice and send a notification for it ONLY IF the ticket statuses matches the status specified in the settings.
            $this->ticket_m->generate_invoice_and_send_notification($data['ticket_id'], $data['status_id']);
        }

        return $result;
    }

}

/* End of file: item_m.php */