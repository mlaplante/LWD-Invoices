<?php defined('BASEPATH') OR exit('No direct script access allowed');
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
class Ticket_m extends Pancake_Model {
    protected $table = 'tickets';
    public $human_value = "concat('#', id)";

    protected $validate = array(
        array(
            'field' => 'subject',
            'label' => 'lang:global:subject',
            'rules' => 'required|max_length[255]',
        ),
        array(
            'field' => 'client_id',
            'label' => 'lang:global:client_id',
            'rules' => 'required',
        ),
        array(
            'field' => 'is_paid',
            'label' => 'lang:global:is_paid',
            'rules' => '',
        ),
        array(
            'field' => 'assigned_user_id',
            'label' => 'lang:global:assigned_user_id',
            'rules' => '',
        ),

        array(
            'field' => 'priority_id',
            'label' => 'lang:global:priority_id',
            'rules' => '',
        ),
        array(
            'field' => 'status_id',
            'label' => 'lang:global:status_id',
            'rules' => '',
        ),

    );

    public $created_during_this_request = [];

    public function assigned_to($user_id, $is_admin = false) {
        if (!$is_admin) {
            $this->db->where('assigned_user_id', $user_id);
        }
        return $this;
    }

    public function get_client_id_by_id($ticket_id) {
        return array_reset($this->db->select("client_id")->where("id", $ticket_id)->get($this->table)->row_array());
    }

    public function insert($data, $skip_validation = false) {
        if (!isset($data['owner_id'])) {
            $data['owner_id'] = current_user();
        }

        if (!isset($data['resolved'])) {
            $data['resolved'] = 0;
        }

        if ($data['assigned_user_id'] === "") {
            $data['assigned_user_id'] = (int) $data['assigned_user_id'];
        }

        if (isset($data['subject'])) {
            $data['subject'] = purify_html($data['subject']);
        }

        $insert_id = parent::insert($data, $skip_validation);

        if (logged_in()) {
            Notify::user_created_ticket($insert_id, current_user());
        } else {
            Notify::client_created_ticket($insert_id, $data["client_id"]);
        }

        $this->created_during_this_request[] = $insert_id;
        return $insert_id;
    }

    public function get_all() {
        where_assigned('tickets', 'read');
        $callback = array($this, 'parent::get_all');
        $args = func_get_args();
        $tickets = call_user_func_array($callback, $args);
        $this->load->model("clients/client_support_rates_matrix_m");

        foreach ($tickets as &$ticket) {
            $support_rate = $this->client_support_rates_matrix_m->getByClientIdAndPriorityId($ticket->client_id, $ticket->priority_id);
            $amount = isset($support_rate['rate']) ? (float) $support_rate['rate'] : 0;
            $ticket->amount = $amount;
        }

        return $tickets;
    }

    public function select($fields = 'tickets.*', $escape = false) {
        $this->db->select($fields, $escape);
        return $this;
    }

    public function join_priority() {
        $this->db->select('ticket_priorities.title priority_title, ticket_priorities.background_color priority_background_color');
        $this->db->join('ticket_priorities', 'tickets.priority_id = ticket_priorities.id', 'left');
        return $this;
    }

    public function join_status() {
        $this->db->select('ticket_statuses.title status_title, ticket_statuses.background_color status_background_color');
        $this->db->join('ticket_statuses', 'tickets.status_id = ticket_statuses.id', 'left');
        return $this;
    }

    public function join_client() {
        $this->db->select('clients.first_name client_first_name, clients.last_name client_last_name, clients.email client_email, clients.unique_id client_unique_id');
        $this->db->join('clients', 'tickets.client_id = clients.id', 'left');
        return $this;
    }

    public function get_priority(&$ticket) {
        $this->load->model('tickets/ticket_priorities_m');
        $ticket->priority = $this->ticket_priorities_m->get($ticket->priority_id);
    }

    public function get_status(&$ticket) {
        $this->load->model('tickets/ticket_statuses_m');
        $ticket->status = $this->ticket_statuses_m->get($ticket->status_id);
    }

    public function get_posts(&$ticket) {
        $this->load->model('tickets/ticket_post_m');
        $ticket->posts = isset($ticket->id) ? $this->ticket_post_m->order_by('created')->get_many_by('ticket_id', $ticket->id) : false;
    }

    public function get_history(&$ticket) {
        $this->load->model('tickets/ticket_history_m');
        $ticket->history = isset($ticket->id) ? $this->ticket_history_m->order_by('created')->get_many_by('ticket_id', $ticket->id) : false;
    }

    public function get_latest_post(&$ticket) {
        $this->load->model('tickets/ticket_post_m');
        $ticket->latest_post = $this->ticket_post_m->order_by('created', 'desc')->limit(1)->get_by('ticket_id', $ticket->id);
    }

    public function get_latest_history(&$ticket) {
        $this->load->model('tickets/ticket_history_m');
        $ticket->latest_history = $this->ticket_history_m->order_by('created', 'desc')->limit(1)->get_by('ticket_id', $ticket->id);
    }

    public function get_response_count(&$ticket) {
        $this->load->model('tickets/ticket_post_m');
        $ticket->response_count = max($this->ticket_post_m->count_by('ticket_id', $ticket->id) - 1, 0);
    }

    public function get_by() {
        where_assigned('tickets', 'read');
        $callback = array($this, 'parent::get_by');
        $args = func_get_args();
        $ticket = call_user_func_array($callback, $args);

        if (isset($ticket->id)) {
            $this->load->model("clients/client_support_rates_matrix_m");
            $support_rate = $this->client_support_rates_matrix_m->getByClientIdAndPriorityId($ticket->client_id, $ticket->priority_id);
            $amount = isset($support_rate['rate']) ? $support_rate['rate'] : 0;
            $ticket->amount = $amount;
        }

        return $ticket;
    }

    public function generate_invoice_and_send_notification($ticket_id, $status_id) {
        $CI = get_instance();
        $CI->load->model("clients/client_support_rates_matrix_m");

        $ticket = $this->db->where("id", $ticket_id)->get("tickets")->row_array();
        if ($CI->client_support_rates_matrix_m->is_billable($ticket['priority_id'], $ticket['client_id'])) {
            if ($status_id > 0 and $status_id == Settings::get("ticket_status_for_sending_invoice")) {
                $this->load->model('invoices/invoice_m');
                if ($ticket['invoice_id'] == 0) {
                    # Ticket did not yet have an invoice generated for it, do that now.
                    $invoice_id = generate_ticket_invoice($ticket_id, $ticket['client_id'], $ticket['priority_id']);
                    $ticket['invoice_id'] = $invoice_id['id'];
                    $this->update($ticket_id, array('invoice_id' => $invoice_id['id']), true);
                }
                $invoice = $this->invoice_m->get_by_id($ticket['invoice_id']);
                $this->invoice_m->update_simple($invoice['unique_id'], array('last_sent' => time(), 'has_sent_notification' => 1));
                $this->sendNotificationEmail('email_new_ticket_invoice', $ticket_id, false, $invoice);
            }
        }
    }

    public function sendNotificationEmail($type, $ticket_id, $admin = false, $invoice = false) {

        $templates = array(
            "email_new_ticket" => "new_ticket",
            "email_ticket_updated" => "ticket_updated",
            "email_ticket_status_updated" => "ticket_status_updated",
            "email_new_ticket_invoice" => "new_ticket_invoice",
        );

        if (!in_array($type, array_keys($templates))) {
            show_error("Email template not found for '$type'.");
        }

        $ticket = $this->get($ticket_id);
        $this->load->model('clients/clients_m');
        $client = (array) $this->clients_m->get($ticket->client_id);

        if ($admin) {
            $user_id = $ticket->assigned_user_id ? $ticket->assigned_user_id : $client['support_user_id'];
            if (!$user_id) {
                $user = $this->ion_auth->get_user();
            } else {
                $user = $this->ion_auth->get_user($user_id);
            }
        }

        if (!$client) {
            show_error('Client ID ' . $ticket->client_id . ' not found');
            return false;
        }

        # Build Client Access URL
        if ($admin) {
            $ticket->url = site_url('admin/tickets/view/' . $ticket->id);
        } else {
            $ticket->url = site_url(Settings::get('kitchen_route') . '/' . $client['unique_id'] . '/tickets/' . $ticket->id);
        }

        $this->get_status($ticket);
        $ticket->status = $ticket->status->title;
        $ticket->name = !$admin ? sprintf('%s %s', $client['first_name'], $client['last_name']) : sprintf('%s %s', $user->first_name, $user->last_name);

        if ($invoice !== false) {
            $ticket->invoice_url = site_url($invoice['unique_id']);
            $ticket->invoice_number = $invoice['invoice_number'];
        }

        $to = $admin ? $user->email : $client['email'];

        $this->load->library('form_validation');

        if (!$this->form_validation->valid_email($to) && $admin) {
            # Not a valid email address.
            # If it's being sent to the client and there's no valid email for them, they'll know that they need to check it manually.
            # If it's being sent to the admin and there's no assigned person, send to the default notifications email.
            $to = \Business::getNotifyEmail();
        }

        $result = Pancake\Email\Email::send(array(
            'to' => $to,
            'template' => $templates[$type],
            'client_id' => $client['id'],
            'data' => array(
                'ticket' => (array) $ticket,
            ),
        ));

        if ($result) {
            return true;
        } else {
            return false;
        }
    }

    public function where_archived() {
        $this->db->where("is_archived", 1);
        return $this;
    }

    public function where_unarchived() {
        $this->db->where("is_archived", 0);
        return $this;
    }

    public function archive($ticket_id) {
        return $this->db->where("id", $ticket_id)->update($this->table, array(
            "is_archived" => 1,
        ));
    }

    public function unarchive($ticket_id) {
        return $this->db->where("id", $ticket_id)->update($this->table, array(
            "is_archived" => 0,
        ));
    }

    /**
     * Is this ticket associated with an invoice?
     *
     * @param int $invoice_id
     *
     * @return boolean
     */
    public function has_invoice($invoice_id) {
        $this->db->where('invoice_id', $invoice_id)->from($this->table);
        return $this->db->count_all_results() > 0;
    }

}

/* End of file: item_m.php */