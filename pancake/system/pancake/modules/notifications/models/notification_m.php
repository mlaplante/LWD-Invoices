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
class Notification_m extends Pancake_Model {

    function get_latest_client_activity(int $x = 5, ?\Carbon\Carbon $since = null)
    {
        if ($since) {
            $this->db->where("created >=", $since->timestamp);
        }
        $results = $this->db->where(array('client_id >' => 0))->order_by("created", "desc")->limit($x)->get($this->table)->result();

        return $this->process_results($results);
    }

    function build_message($notification_id, $lang_string, $client_id, $url, $number, $date, $user_id = null, $extra = []) {
        $parsed_url = parse_url($url);
        if (!isset($parsed_url["host"])) {
            $url = site_url($url);
        }

        $number = strip_tags($number);

        $CI = get_instance();

        if ($user_id > 0) {
            get_instance()->load->model('users/user_m');
            $user = get_instance()->user_m->get_users_by_ids([$user_id]);
            $user = reset($user);
            $email = $user["email"];
            $name = trim($user["first_name"] . " " . $user["last_name"]);
            $profile_picture_url = get_gravatar($email, 60);
        } elseif ($client_id > 0) {
            get_instance()->load->model('clients/clients_m');
            $name = client_name($client_id);
            $profile_picture_url = $CI->clients_m->get_gravatar($client_id);
        } else {
            throw new Exception("Could not build a notification message; a user or client ID were not provided.");
        }

        $data = [
            '<img src="' . $profile_picture_url . '"  /><div class="notification-text" data-notification-id="' . $notification_id . '"><strong class="client-name">' . $name . "</strong>",
            $url,
            $number,
            $date . '</div>',
        ];

        $data = array_merge($data, $extra);
        return __($lang_string, $data);
    }

    protected function process_results($results) {
        $allowed_task_ids = get_assigned_ids('project_tasks', 'read');
        $allowed_invoice_ids = get_assigned_ids('invoices', 'read');
        $allowed_estimate_ids = get_assigned_ids('estimates', 'read');
        $allowed_proposal_ids = get_assigned_ids('proposals', 'read');

        $results = collect($results);
        $contexts = [
            Notify::CONTEXT_ESTIMATE,
            Notify::CONTEXT_INVOICE,
            Notify::CONTEXT_CREDIT_NOTE,
        ];
        $invoice_ids = $results->whereIn("context", $contexts)->pluck("context_id")->unique()->toArray();

        $CI = get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('clients/clients_m');

        $invoices = $this->invoice_m->flexible_get_all([
            "id" => $invoice_ids,
            "type" => "all",
            "return_object" => false
        ]);
        # $this->flexible_get_all(array('client_id' => $client_id, 'archived' => $archived, 'project_id' => $project_id, 'paid' => true, 'offset' => $offset, 'include_totals' => true));

        foreach ($results as $key => $notification) {
            if (empty($notification->message)) {
                # Default message.
                $message = "<div class='notification-text'>Notification of context {$notification->context} and action {$notification->action} has not yet been built.</div>";



                if ($notification->user_id > 0) {
                    $CI->load->model('users/user_m');
                    $user = $CI->user_m->get_users_by_ids([$notification->user_id]);
                    $user = reset($user);
                }

                $date = '<span class="date">' . format_date($notification->created, true) . '</span>';

                switch ($notification->context) {
                    case Notify::CONTEXT_ESTIMATE:

                        if (!in_array($notification->context_id, $allowed_estimate_ids)) {
                            unset($results[$key]);
                            continue 2;
                        }

                        if (!isset($invoices[$notification->context_id])) {
                            unset($results[$key]);
                            continue 2;
                        }

                        $record = $invoices[$notification->context_id];

                        switch ($notification->action) {
                            case Notify::ACTION_VIEWED:
                                $notification->dashboard_class = "activity-invoice-viewed";
                                $lang_string = 'estimates:client_viewed';
                                break;
                            case Notify::ACTION_ACCEPTED:
                                $notification->dashboard_class = "activity-proposal-accept";
                                $lang_string = 'estimates:client_accepted';
                                break;
                            case Notify::ACTION_REJECTED:
                                $notification->dashboard_class = "activity-proposal-reject";
                                $lang_string = 'estimates:client_rejected';
                                break;
                        }

                        $message = $this->build_message($notification->id, $lang_string, $record['client_id'], $record['unique_id'], $record['invoice_number'], $date);
                        break;
                    case Notify::CONTEXT_CREDIT_NOTE:
                        if (!isset($invoices[$notification->context_id])) {
                            unset($results[$key]);
                            continue 2;
                        }

                        $record = $invoices[$notification->context_id];

                        switch ($notification->action) {
                            case Notify::ACTION_VIEWED:
                                $notification->dashboard_class = "activity-invoice-viewed";
                                $lang_string = "credit_notes:client_viewed";
                                break;
                        }

                        $message = $this->build_message($notification->id, $lang_string, $record['client_id'], $record['unique_id'], $record['invoice_number'], $date);
                        break;
                    case Notify::CONTEXT_COMMENT:
                        $CI->load->model('kitchen/kitchen_comment_m');
                        $record = $CI->kitchen_comment_m->get($notification->context_id);

                        if (!isset($record->id)) {
                            unset($results[$key]);
                            continue 2;
                        }

                        $item = $CI->kitchen_comment_m->get_item_details($record->item_type, $record->item_id);

                        if (!$item["exists"]) {
                            unset($results[$key]);
                            continue 2;
                        }

                        switch ($notification->action) {
                            case Notify::ACTION_COMMENTED:
                                $notification->dashboard_class = "activity-comment";
                                $lang_string = "notifications:new_comment";
                                break;
                        }

                        $message = $this->build_message($notification->id, $lang_string, $record->client_id, $record->url_for_logged_in_users, $item["title"], $date, $record->user_id);
                        break;
                    case Notify::CONTEXT_TICKET:
                    case Notify::CONTEXT_TICKET_HISTORY:
                    case Notify::CONTEXT_TICKET_POST:
                        $CI->load->model('tickets/ticket_m');
                        $extra = [];
                        if ($notification->context == Notify::CONTEXT_TICKET_POST) {
                            $CI->load->model('tickets/ticket_post_m');
                            $post = $this->ticket_post_m->get($notification->context_id);
                            $ticket_id = $post->ticket_id;
                            $lang_string = "notifications:responded_ticket";
                        } elseif ($notification->context == Notify::CONTEXT_TICKET_HISTORY) {
                            $CI->load->model('tickets/ticket_history_m');
                            $CI->load->model('tickets/ticket_statuses_m');
                            $history = $this->ticket_history_m->get($notification->context_id);
                            $ticket_id = $history->ticket_id;
                            $lang_string = "notifications:updated_status_ticket";
                            $status = $this->ticket_statuses_m->get($history->status_id);
                            if (is_object($status) && isset($status->title)) {
                                $status = $status->title;
                            } else {
                                $status = __("global:nolongerexists");
                            }

                            $extra[] = $status;
                        } else {
                            $ticket_id = $notification->context_id;
                            $lang_string = "notifications:new_ticket";
                        }
                        $record = $this->ticket_m->get($ticket_id);

                        if (!isset($record->id)) {
                            unset($results[$key]);
                            continue 2;
                        }

                        switch ($notification->action) {
                            case Notify::ACTION_CREATED:
                                $notification->dashboard_class = "activity-ticket";
                                break;
                        }

                        $url = site_url("admin/tickets/view/{$record->id}");
                        $title = __("tickets:ticket_title", [$record->id, $record->subject]);
                        $message = $this->build_message($notification->id, $lang_string, $record->client_id, $url, $title, $date, $notification->user_id, $extra);
                        break;
                    case Notify::CONTEXT_TASK:
                        if (!in_array($notification->context_id, $allowed_task_ids)) {
                            unset($results[$key]);
                            continue 2;
                        }

                        $CI->load->model('projects/project_task_m');
                        $task = $this->project_task_m->get_task_by_id($notification->context_id)->row_array();

                        switch ($notification->action) {
                            case Notify::ACTION_COMPLETED:
                                $notification->dashboard_class = "activity-proposal-accept";
                                $lang_string = 'tasks:task_completed_by';
                                break;
                        }

                        $url = "admin/projects/view/" . $task['project_id'];
                        $message = $this->build_message($notification->id, $lang_string, null, $url, $task['name'], $date, $notification->user_id);
                        break;
                    case Notify::CONTEXT_INVOICE:

                        if (!in_array($notification->context_id, $allowed_invoice_ids)) {
                            unset($results[$key]);
                            continue 2;
                        }

                        if (!isset($invoices[$notification->context_id])) {
                            unset($results[$key]);
                            continue 2;
                        }

                        $record = $invoices[$notification->context_id];

                        switch ($notification->action) {
                            case Notify::ACTION_VIEWED:
                                $notification->dashboard_class = "activity-invoice-viewed";
                                $lang_string = 'invoices:client_viewed';
                                break;
                            case Notify::ACTION_PAID:
                                $notification->dashboard_class = "activity-invoice-paid";
                                $lang_string = 'invoices:client_paid';
                                break;
                        }


                        $message = $this->build_message($notification->id, $lang_string, $record['client_id'], $record['unique_id'], $record['invoice_number'], $date);
                        break;
                    case Notify::CONTEXT_PROPOSAL:

                        if (!in_array($notification->context_id, $allowed_proposal_ids)) {
                            unset($results[$key]);
                            continue 2;
                        }

                        $CI->load->model('proposals/proposals_m');
                        $CI->load->model('clients/clients_m');
                        $record = $this->proposals_m->getAll(null, null, array('id' => $notification->context_id));
                        $record = (array) reset($record);
                        $client = $CI->clients_m->getById($record['client_id']);

                        switch ($notification->action) {
                            case Notify::ACTION_VIEWED:
                                $notification->dashboard_class = "activity-invoice-viewed";
                                $lang_string = 'proposals:client_viewed';
                                break;
                            case Notify::ACTION_ACCEPTED:
                                $notification->dashboard_class = "activity-proposal-accept";
                                $lang_string = 'proposals:client_accepted';
                                break;
                            case Notify::ACTION_REJECTED:
                                $notification->dashboard_class = "activity-proposal-reject";
                                $lang_string = 'proposals:client_rejected';
                                break;
                        }

                        $message = $this->build_message($notification->id, $lang_string, $record['client_id'], 'proposal/' . $record['unique_id'], $record['proposal_number'] . ": " . $record['title'], $date);
                        break;
                }

                $results[$key]->message = $message;

                $matches = [];
                preg_match('~<div class="notification-text"[^>]+>(.*?)</div>~us', $message, $matches);
                if (!isset($matches[1])) {
                    throw new Exception("Could not detect dashboard message from $message.");
                }
                $results[$key]->dashboard_message = $matches[1];
            }
        }

        return $results;
    }

    function get_unseen() {
        $user_id = current_user();
        $data = [
            'seen' => false,
            "(user_id is null or user_id != $user_id)" => null,
        ];
        $unseen = $this->get_many_by($data);
        return $this->process_results($unseen);
    }

    function get_seen_ids($ids_on_screen) {
        if (count($ids_on_screen) == 0) {
            return [];
        }

        $user_id = current_user();
        $data = [
            'id' => $ids_on_screen,
            'seen' => true,
            "(user_id is null or user_id != $user_id)" => null,
        ];
        $seen = $this->get_many_by($data);
        $seen = array_map(function ($value) {
            return (int) $value->id;
        }, $seen);
        return array_values($seen);
    }

}

class Notify {

    const CONTEXT_TASK = 'Task';
    const CONTEXT_INVOICE = 'Invoice';
    const CONTEXT_CREDIT_NOTE = 'Credit Note';
    const CONTEXT_ESTIMATE = 'Estimate';
    const CONTEXT_PROPOSAL = 'Proposal';
    const CONTEXT_COMMENT = 'Comment';
    const CONTEXT_TICKET = 'Ticket';
    const CONTEXT_TICKET_POST = 'Ticket Post';
    const CONTEXT_TICKET_HISTORY = 'Ticket Status Update';
    const ACTION_VIEWED = 'viewed';
    const ACTION_COMMENTED = 'commented';
    const ACTION_COMPLETED = 'completed';
    const ACTION_PAID = 'paid';
    const ACTION_ACCEPTED = 'accepted';
    const ACTION_REJECTED = 'rejected';
    const ACTION_CREATED = 'created';

    /**
     * Gets the number of seconds to wait between checks for new notifications.
     *
     * @return integer
     */
    public static function get_poll_interval() {
        $event = 'decide_poll_interval';
        if (Events::has_listeners($event)) {
            $results = Events::trigger($event, null, null);
            $poll_interval = array_end($results);

            if (!is_numeric($poll_interval)) {
                $poll_interval = 10;
                log_without_error("A plugin did not return a valid poll interval.", $results);
            }
        } else {
            $poll_interval = 10;
        }

        return $poll_interval;
    }

    public static function client_viewed_invoice($invoice_id, $client_id) {
        Notify::send(self::CONTEXT_INVOICE, $invoice_id, self::ACTION_VIEWED, null, $client_id);
    }

    public static function client_paid_invoice($invoice_id, $client_id) {
        Notify::send(self::CONTEXT_INVOICE, $invoice_id, self::ACTION_PAID, null, $client_id);
    }

    public static function client_viewed_credit_note($credit_note_id, $client_id) {
        Notify::send(self::CONTEXT_CREDIT_NOTE, $credit_note_id, self::ACTION_VIEWED, null, $client_id);
    }

    public static function client_viewed_estimate($estimate_id, $client_id) {
        Notify::send(self::CONTEXT_ESTIMATE, $estimate_id, self::ACTION_VIEWED, null, $client_id);
    }

    public static function client_accepted_estimate($estimate_id, $client_id) {
        Notify::send(self::CONTEXT_ESTIMATE, $estimate_id, self::ACTION_ACCEPTED, null, $client_id);

        $estimate = get_instance()->invoice_m->get_by_id($estimate_id);

        if (!logged_in()) {
            Pancake\Email\Email::send(array(
                'to' => Business::getNotifyEmail(),
                'template' => "estimate_accepted",
                'client_id' => $client_id,
                'data' => array(
                    'estimate' => $estimate,
                    'number' => $estimate['invoice_number'],
                ),
            ));
        }
    }

    public static function client_rejected_estimate($estimate_id, $client_id) {
        Notify::send(self::CONTEXT_ESTIMATE, $estimate_id, self::ACTION_REJECTED, null, $client_id);

        $estimate = get_instance()->invoice_m->get_by_id($estimate_id);

        if (!logged_in()) {
            Pancake\Email\Email::send(array(
                'to' => Business::getNotifyEmail(),
                'template' => "estimate_rejected",
                'client_id' => $client_id,
                'data' => array(
                    'estimate' => $estimate,
                    'number' => $estimate['invoice_number'],
                ),
            ));
        }
    }

    public static function client_viewed_proposal($proposal_id, $client_id) {
        Notify::send(self::CONTEXT_PROPOSAL, $proposal_id, self::ACTION_VIEWED, null, $client_id);
    }

    public static function client_commented($comment_id, $client_id) {
        Notify::send(self::CONTEXT_COMMENT, $comment_id, self::ACTION_COMMENTED, null, $client_id);
    }

    public static function user_commented($comment_id, $user_id) {
        Notify::send(self::CONTEXT_COMMENT, $comment_id, self::ACTION_COMMENTED, $user_id, null);
    }

    public static function client_created_ticket($ticket_id, $client_id) {
        Notify::send(self::CONTEXT_TICKET, $ticket_id, self::ACTION_CREATED, null, $client_id);
    }

    public static function user_created_ticket($ticket_id, $user_id) {
        Notify::send(self::CONTEXT_TICKET, $ticket_id, self::ACTION_CREATED, $user_id, null);
    }

    public static function client_responded_ticket($ticket_post_id, $client_id) {
        Notify::send(self::CONTEXT_TICKET_POST, $ticket_post_id, self::ACTION_CREATED, null, $client_id);
    }

    public static function user_responded_ticket($ticket_post_id, $user_id) {
        Notify::send(self::CONTEXT_TICKET_POST, $ticket_post_id, self::ACTION_CREATED, $user_id, null);
    }

    public static function client_updated_ticket_status($ticket_history_id, $client_id) {
        Notify::send(self::CONTEXT_TICKET_HISTORY, $ticket_history_id, self::ACTION_CREATED, null, $client_id);
    }

    public static function user_updated_ticket_status($ticket_history_id, $user_id) {
        Notify::send(self::CONTEXT_TICKET_HISTORY, $ticket_history_id, self::ACTION_CREATED, $user_id, null);
    }

    public static function client_accepted_proposal($proposal_id, $client_id) {
        Notify::send(self::CONTEXT_PROPOSAL, $proposal_id, self::ACTION_ACCEPTED, null, $client_id);

        $proposal = get_instance()->proposals_m->getById($proposal_id);

        if (!logged_in()) {
            Pancake\Email\Email::send(array(
                'to' => Business::getNotifyEmail(),
                'template' => "proposal_accepted",
                'client_id' => $client_id,
                'data' => array(
                    'proposal' => $proposal,
                    'number' => $proposal['proposal_number'],
                ),
            ));
        }
    }

    public static function client_rejected_proposal($proposal_id, $client_id) {
        Notify::send(self::CONTEXT_PROPOSAL, $proposal_id, self::ACTION_REJECTED, null, $client_id);

        $proposal = get_instance()->proposals_m->getById($proposal_id);

        if (!logged_in()) {
            Pancake\Email\Email::send(array(
                'to' => Business::getNotifyEmail(),
                'template' => "proposal_rejected",
                'client_id' => $client_id,
                'data' => array(
                    'proposal' => $proposal,
                    'number' => $proposal['proposal_number'],
                ),
            ));
        }
    }

    public static function user_completed_task($task_id, $user_id) {
        Notify::send(self::CONTEXT_TASK, $task_id, self::ACTION_COMPLETED, $user_id);
    }

    public static function send($context, $context_id, $action = null, $user_id = null, $client_id = null) {
        $ci = &get_instance();

        // Do not create a notification if an unseen one already exists for that very same thing.

        $existing_notifications = $ci->db->where(array(
            'context' => $context,
            'context_id' => $context_id,
            'action' => $action,
            'user_id' => $user_id,
            'client_id' => $client_id,
            'seen' => 0,
        ))->where("FROM_UNIXTIME(created, '%Y-%m-%d') = DATE_FORMAT(NOW(), '%Y-%m-%d')", null, false)->count_all_results('notifications');

        if ($existing_notifications > 0) {
            return;
        }

        $ci->notification_m->insert(array(
            'created' => time(),
            'context' => $context,
            'context_id' => $context_id,
            'action' => $action,
            'message' => "",
            'user_id' => $user_id,
            'client_id' => $client_id,
        ));
    }

}

/* End of file: item_m.php */