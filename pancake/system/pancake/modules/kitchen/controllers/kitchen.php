<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright	Copyright (c) 2010, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 1.0
 */
// ------------------------------------------------------------------------

/**
 * The admin controller for the dashboard
 *
 * @subpackage	Controllers
 * @category	Kitchen
 */
class Kitchen extends Public_Controller {

    /**
     * Routes the request, shows the client
     *
     * @access	public
     * @param	string	The method name from the URI
     * @return	void
     */
    public function _remap($method, $params) {

        $callable_methods = array("get_client_support_matrix_json", "login", "logout");

        if (in_array($method, $callable_methods)) {
            return call_user_func_array(array($this, $method), $params);
        }

        $client = $this->_get_client($method);

        if (!empty($client)) {

            switch_language($client->language);
            Business::setBusinessFromClient($client->id);

            $this->template->client = $client;
            $this->template->set_layout('kitchen');

            if (empty($client->passphrase) || $this->session->userdata('client_passphrase') == $client->passphrase || logged_in()) {
                if (isset($params[0]) && is_callable(array($this, $params[0]))) {
                    $method = $params[0];
                    $params[0] = $client;
                    return call_user_func_array(array($this, $method), $params);
                }

                $this->load->model('invoices/invoice_m');
                $this->load->model('projects/project_task_m');
                $this->load->model('projects/project_m');
                $this->load->model('proposals/proposals_m');
                $this->load->model("clients/clients_meta_m");
                $this->load->model('kitchen_comment_m');

                $this->template->custom = $this->clients_meta_m->fetch($client->id);
                $this->template->latest = array_reset($this->invoice_m->flexible_get_all(array(
                            'per_page' => 0,
                            'viewable' => 1,
                            'archived' => 0,
                            'client_id' => $client->id,
                            'include_totals' => true,
                            'include_partials' => true,
                )));
                $this->template->invoices = $this->invoice_m->get_all_viewable($client->id);
                $this->template->credit_notes = $this->invoice_m->get_all_viewable($client->id, true, 'credit_notes');
                $this->template->estimates = $this->invoice_m->get_all_viewable($client->id, TRUE, 'estimates');
                $this->template->projects = $this->project_m->get_all_viewable($client->id);
                $this->template->proposals = $this->proposals_m->get_all_viewable($client->id);
                $this->template->comment_count = $this->kitchen_comment_m->count_all_client_comments($client->id);

                $totals = [
                    "paid" => $client->paid_total,
                    "unpaid" => $client->unpaid_total,
                    "credit" => $client->credit_balance,
                ];

                foreach ($totals as $key => $value) {
                    $totals[$key] = Currency::format($value, $client->default_currency_code);
                }
                $this->template->client_totals = $totals;

                $this->load->helper('typography');
                $this->template->build('default');
            } else {
                $this->load->model("users/user_m");
                $this->template->set_partial('notifications', 'partials/notifications');
		        $this->user_m->login($client->language, $client->unique_id);
            }
        } else {
            if (is_admin() or IS_DEMO) {
                redirect('admin');
            } else {
                $this->load->model("users/user_m");
                $this->template->set_partial('notifications', 'partials/notifications');
                $this->user_m->login();
            }
        }
    }

    /**
     * Process passphrase submission
     *
     * @access 	public
     * @param 	string 	client unique id
     * @return 	null
     */
    public function login($unique_id = null) {
        if (empty($unique_id)) {
            # Redirect to the main login page.
            redirect("");
        }

        if (is_object($unique_id)) {
            # User is already logged in.
            redirect(Settings::get('kitchen_route') . '/' . $unique_id->unique_id);
        }

        $this->load->model("users/user_m");
        $client = $this->_get_client($unique_id);

        if ($client->passphrase === "") {
            # The user doesn't need to login.
            redirect(Settings::get('kitchen_route') . '/' . $unique_id);
        }

        $this->user_m->login($client->language, $unique_id);
    }

    /**
     * Logout the passphrase clients
     *
     * @access 	public
     * @param 	string 	client unique id
     * @return 	null
     */
    public function logout($unique_id) {
        $this->session->unset_userdata('client_passphrase');

        redirect(Settings::get('kitchen_route') . '/' . (is_string($unique_id) ? $unique_id : $unique_id->unique_id));
    }

    public function edit_comment($client, $comment_id = null, $item_type = null, $item_id = null) {

        if ($comment_id === null || $item_type === null || $item_id === null) {
            show_404();
        }

        $this->load->model('kitchen_comment_m');

        $comment = $this->db->get_where('comments', array(
                    'client_id' => $client->id,
                    'id' => $comment_id
                ))->row();

        if (($comment->user_id == null and ! logged_in()) or ( logged_in())) {

            if ($_POST) {
                $data = array();
                $data['client_id'] = $client->id;
                $data['item_type'] = $item_type;
                $data['item_id'] = $item_id;
                $data['user_id'] = (logged_in() ? $this->current_user->id : NULL);
                $data['user_name'] = (logged_in() ? $this->current_user->first_name . ' ' . $this->current_user->last_name : $client->first_name . ' ' . $client->last_name);

                if ($this->kitchen_comment_m->update_comment($comment_id, $_POST + $data, @$_FILES['files'])) {
                    if (isset($_FILES['files'])) {
                        $this->load->model('kitchen_files_m');
                        $this->kitchen_files_m->upload($_FILES['files'], $comment_id, $client->id);
                    }
                }

                redirect(Settings::get('kitchen_route') . '/' . $client->unique_id . '/comments/' . $item_type . '/' . $item_id);
            }

            $this->template->client = $client;
            $this->template->item_type = $item_type;
            $this->template->item_id = $item_id;
            $this->template->is_client = !logged_in(); # If you're not logged in, you're a client.
            $this->template->comment = $comment;
            $this->template->comment->files = $this->kitchen_comment_m->get_files($this->template->comment->id);
            $this->template->build('edit_comment');
        } else {
            redirect(Settings::get('kitchen_route') . '/' . $client->unique_id . '/comments/' . $item_type . '/' . $item_id);
        }
    }

    public function delete_comment($client, $comment_id = null, $item_type = null, $item_id = null) {

        if ($comment_id === null || $item_type === null || $item_id === null) {
            redirect(Settings::get('kitchen_route') . '/' . $client->unique_id . '/comments/' . $item_type . '/' . $item_id);
        }

        $comment = $this->db->where('client_id', $client->id)->where('id', $comment_id)->get('comments')->row();

        if (($comment->user_id == null and !logged_in()) or (logged_in())) {
            $this->db->where('client_id', $client->id)->where('id', $comment_id)->delete('comments');
        }

        redirect(Settings::get('kitchen_route') . '/' . $client->unique_id . '/comments/' . $item_type . '/' . $item_id);
    }

    /**
     * Comments
     *
     * @access  public
     * @param   object  client
     * @param   string  item type
     * @param   int     item id
     * @return  null
     */
    public function comments($client, $item_type = null, $item_id = null) {

        if ($item_type === null || $item_id === null) {
            show_404();
        }

        if (logged_in()) {
            redirect("admin/discussions/$item_type/$item_id");
        }

        $this->load->library('form_validation');
        $this->load->model('kitchen_comment_m');
        $this->load->model("clients/clients_m");
        $this->load->model("users/user_m");
        $this->load->model('invoices/invoice_m');
        $this->load->model('projects/project_task_m');
        $this->load->model('projects/project_m');
        $this->load->model('proposals/proposals_m');
        $this->load->model('kitchen_files_m');

        $comments = $this->kitchen_comment_m->order_by('created')->get_many_by(array(
            'client_id' => $client->id,
            'item_type' => $item_type,
            'item_id' => $item_id,
            'is_private' => '0'
        ));

        $details = $this->kitchen_comment_m->get_item_details($item_type, $item_id);
        $title = $details["title"];

        foreach ($comments as $key => $comment) {
            if (($comment->user_id == null and ! logged_in()) or ( logged_in())) {
                $comments[$key]->being_viewed_by_owner = true;
            } else {
                $comments[$key]->being_viewed_by_owner = false;
            }

            if ($comment->user_id) {
                $comments[$key]->user = $this->user_m->getUserById($comment->user_id);
                $comments[$key]->user_name = ($comment->user["first_name"] . ' ' . $comment->user["last_name"]);
            } elseif ($comment->client_id != '0') {
                $comments[$key]->client = $this->clients_m->getById($comment->client_id);
                $comments[$key]->user_name = client_name($comment->client_id);
            }
        }

        $this->template->title = $title;
        $this->template->client = $client;
        $this->template->set_layout('kitchen');
        $this->template->comments = $comments;
        $this->template->item_type = $item_type;
        $this->template->item_id = $item_id;

        switch ($item_type) {
            case 'client':
                # Limit client access.
                if ($item_id !== $client->id) {
                    redirect(Settings::get('kitchen_route') . '/' . $client->unique_id);
                }
                break;
            case 'invoice':
                $this->template->invoice = $this->invoice_m->get_by(array(
                    'id' => $item_id,
                    'client_id' => $client->id,
                    'is_viewable' => 1,
                ));

                if (!isset($this->template->invoice->id)) {
                    redirect(Settings::get('kitchen_route') . '/' . $client->unique_id);
                }
                break;
            case 'project':
                $this->template->project = $this->project_m->get_by(array(
                    'id' => $item_id,
                    'client_id' => $client->id,
                    'is_viewable' => 1,
                ));

                if (!isset($this->template->project->id)) {
                    redirect(Settings::get('kitchen_route') . '/' . $client->unique_id);
                }

                break;
            case 'task':
                $task = $this->project_task_m->get_by(array(
                    'id' => $item_id,
                    'project_id' => $this->project_m->get_ids_by_client($client->id),
                    'is_viewable' => 1,
                ));

                if (!isset($task->id)) {
                    redirect(Settings::get('kitchen_route') . '/' . $client->unique_id);
                } else {
                    $project = $this->project_m->get_by(array(
                        'id' => $task->project_id
                    ));

                    $task->project = $project;
                    $this->template->task = $task;
                }

                break;
            case 'proposal':
                $this->template->proposal = $this->proposals_m->get_by(array(
                    'id' => $item_id,
                    'client_id' => $client->id,
                ));

                if (!isset($this->template->proposal->id)) {
                    redirect(Settings::get('kitchen_route') . '/' . $client->unique_id);
                }

                break;
        }

        # We do this after verifying that the comment's item type is valid (above), to avoid allowing comments on items that shouldn't be allowed.
        if ($_POST) {
            $data['client_id'] = $client->id;
            $data['item_type'] = $item_type;
            $data['item_id'] = $item_id;
            $data['user_id'] = (logged_in() ? $this->current_user->id : NULL);
            $data['user_name'] = (logged_in() ? $this->current_user->first_name . ' ' . $this->current_user->last_name : $client->first_name . ' ' . $client->last_name);
            $data['is_private'] = false;
            $files = isset($_FILES['files']) ? $_FILES['files'] : null;
            if ($comment_id = $this->kitchen_comment_m->insert_comment($_POST + $data, $files)) {
                if (isset($_FILES['files'])) {
                    $this->kitchen_files_m->upload($_FILES['files'], $comment_id, $client->id);
                }
            }

            redirect(Settings::get('kitchen_route') . '/' . $client->unique_id . '/comments/' . $item_type . '/' . $item_id);
        }

        $this->template->build('comments');
    }

    function download_ticket_file() {
        $base = $this->uri->segment(4);
        $path = urldecode($this->uri->segment(5));
        $file = urldecode($this->uri->segment(6));

        if (empty($base) || empty($path) || empty($file)) {
            show_404();
        }

        $this->load->helper('download');

        $file = sprintf('%s/%s/%s', $base, $path, $file);

        if (\Pancake\Filesystem\Filesystem::has($file)) {
            force_download(array_end(explode("/", $file)), \Pancake\Filesystem\Filesystem::read($file));
        } else {
            throw new \Pancake\Filesystem\FileNotFoundException("The file you were trying to access ($file) does not exist in " . implode(", ", \Pancake\Filesystem\Filesystem::getEnabledAdapters()) . ".");
        }
    }

    public function new_ticket($client) {
        $this->load->model('tickets/ticket_m');
        $this->load->model('tickets/ticket_post_m');
        $this->load->model('tickets/ticket_statuses_m');
        $this->load->model('tickets/ticket_history_m');
        $this->load->model('tickets/ticket_priorities_m', 'priorities');
        $this->load->model("clients/client_support_rates_matrix_m");

        if (count($_POST) > 0) {

            $files = FALSE;
            $file = FALSE;

            if ($_FILES) {
                $this->load->model('files/files_m', 'files');
                $files = $this->files->upload($_FILES['ticketfile'], 'tickets');
                if ($files !== FALSE) {
                    $file = new stdClass;

                    foreach ($files as $k => $v) {
                        $file->o_name = $k;
                        $file->r_name = $v['folder_name'] . $k;
                    }
                }
            }

            $ticket_id = $this->ticket_m->insert(array(
                'subject' => $this->input->post('subject'),
                'client_id' => $client->id,
                'assigned_user_id' => fix_assigned($client->support_user_id),
                'status_id' => $this->input->post('status_id'),
                'priority_id' => $this->input->post('priority_id'),
                'created' => time(),
            ));

            if ($ticket_id) {
                //if we're just changing the status of a ticket, we don't need to send a message and the validation rule should take care of that
                $post_id = $this->ticket_post_m->insert(array(
                    'ticket_id' => $ticket_id,
                    'user_id' => null,
                    'orig_filename' => $files !== FALSE ? $file->o_name : '',
                    'real_filename' => $files !== FALSE ? $file->r_name : '',
                    'user_name' => $client->first_name . ' ' . $client->last_name,
                    'message' => $this->input->post('message'),
                    'created' => time(),
                ));

                $this->ticket_history_m->insert(array(
                    'ticket_id' => $ticket_id,
                    'user_id' => null,
                    'user_name' => $client->first_name . ' ' . $client->last_name,
                    'status_id' => $this->input->post('status_id'),
                    'created' => time(),
                ));

                //send email notification with link to kitchen/ticket and if you're feeling sassy, an anchor to this message.
                //ok :-D
                $this->ticket_m->sendNotificationEmail('email_new_ticket', $ticket_id);
                $this->ticket_m->sendNotificationEmail('email_new_ticket', $ticket_id, TRUE);


                $this->session->set_flashdata('success', lang('tickets:added'));
                redirect(Settings::get('kitchen_route') . '/' . $client->unique_id . '/tickets/' . $ticket_id);
            }
        } else {
            $data = array(
                'statuses' => $this->ticket_statuses_m->getDropdown(),
                'priorities' => $this->client_support_rates_matrix_m->getDropdown($client->id)
            );

            $this->template->build('new_ticket', $data);
        }
    }

    public function tickets($client, $ticket_id = null) {
        $this->load->model('tickets/ticket_m');
        $this->load->model('tickets/ticket_post_m');
        $this->load->model('tickets/ticket_statuses_m');
        $this->load->model('tickets/ticket_priorities_m', 'priorities');
        $this->load->model('tickets/ticket_history_m');
        $this->load->model("clients/client_support_rates_matrix_m");

        if ($ticket_id) {
            $has_ticket = $this->ticket_m->get_by(array('client_id' => $client->id, 'id' => $ticket_id));
            if (!$has_ticket) {
                show_404();
            }
        }

        if ($this->input->post() && $ticket_id) {

            $files = FALSE;
            $file = FALSE;

            if ($_FILES) {
                $this->load->model('files/files_m', 'files');
                $files = $this->files->upload($_FILES['ticketfile'], 'tickets');
                if ($files !== FALSE) {
                    $file = new stdClass;

                    foreach ($files as $k => $v) {
                        $file->o_name = $k;
                        $file->r_name = $v['folder_name'] . $k;
                    }
                }
            }

            if ($this->input->post('message')) {
                $post_id = $this->ticket_post_m->insert(array(
                    'ticket_id' => $ticket_id,
                    'user_id' => null,
                    'orig_filename' => $files !== FALSE ? $file->o_name : '',
                    'real_filename' => $files !== FALSE ? $file->r_name : '',
                    'user_name' => $client->first_name . ' ' . $client->last_name,
                    'message' => $this->input->post('message'),
                    'created' => time(),
                ));

                $this->ticket_m->sendNotificationEmail('email_ticket_updated', $ticket_id, TRUE);
            }

            $current_ticket = $ticket_id ? $this->ticket_m->select()->join_priority()->join_status()->join_client()->get_by('tickets.id', $ticket_id) : FALSE;

            if (!is_null($current_ticket)) {
                if ($this->input->post() && $this->input->post('status_id') !== $current_ticket->status_id) {
                    $this->ticket_m->update($ticket_id, array('status_id' => $this->input->post('status_id')), TRUE);

                    $this->ticket_history_m->insert(array(
                        'ticket_id' => $ticket_id,
                        'user_id' => null,
                        'user_name' => $client->first_name . ' ' . $client->last_name,
                        'status_id' => $this->input->post('status_id'),
                        'created' => time(),
                    ));

                    $this->ticket_m->sendNotificationEmail('email_ticket_status_updated', $ticket_id);
                }
            }

            redirect(Settings::get('kitchen_route') . '/' . $client->unique_id . '/tickets/' . $ticket_id);
        }

        $tickets = $this->ticket_m->select()->join_priority()->join_status()->order_by('tickets.created', 'desc')->get_many_by('client_id', $client->id);
        foreach ($tickets as $ticket) {
            $this->ticket_m->get_response_count($ticket);
            $this->ticket_m->get_latest_post($ticket);
            $this->ticket_m->get_latest_history($ticket);

            $ticket->latest_post_created = !empty($ticket->latest_post) ? $ticket->latest_post->created : null;
            $ticket->latest_history_created = !empty($ticket->latest_history) ? $ticket->latest_history->created : null;
            $ticket->latest = max($ticket->latest_post_created, $ticket->latest_post_created, $ticket->created);
        }

        if (!$ticket_id && count($tickets))
            $ticket_id = $tickets[0]->id;

        $current_ticket = isset($ticket_id) ? $this->ticket_m->select()->join_priority()->join_status()->join_client()->get_by('tickets.id', $ticket_id) : FALSE;

        if ($current_ticket) {

            $this->ticket_m->get_posts($current_ticket);
            $this->ticket_m->get_history($current_ticket);

            //combine posts and history into 1 array that we can sort by time


            if ($current_ticket->posts !== FALSE) {
                $current_ticket->activity = array();

                foreach ($current_ticket->posts as $post) {
                    if (!isset($current_ticket->activity[$post->created])) {
                        $current_ticket->activity[$post->created] = array();
                    }
                    $this->ticket_post_m->get_user($post);
                    $current_ticket->activity[$post->created]['post'] = $post;
                }
            }


            if ($current_ticket->history !== FALSE) {
                foreach ($current_ticket->history as $history) {
                    if (!isset($current_ticket->activity[$history->created])) {
                        $current_ticket->activity[$history->created] = array();
                    }
                    $this->ticket_history_m->get_status($history);
                    $current_ticket->activity[$history->created]['history'] = $history;
                }
            }

            if (isset($current_ticket->activity))
                ksort($current_ticket->activity);

            if (!$current_ticket->posts && !$current_ticket->history)
                $current_ticket = false;
        }

        $data = array(
            'tickets' => $tickets,
            'current_ticket' => $current_ticket,
            'statuses' => $this->ticket_statuses_m->getDropdown(),
        );

        $this->template->build('tickets', $data);
    }

    public function download($client, $comment_id = null, $file_id = null) {

        if ($comment_id === null || $file_id === null) {
            show_404();
        }

        $this->load->model('kitchen_files_m');
        $this->load->helper('download');

        $file = $this->kitchen_files_m->get_by(array('comment_id' => $comment_id, 'id' => $file_id));

        if (empty($file)) {
            show_error('File not found.');
        }

        $original = $file->orig_filename;
        $file = $file->real_filename;

        if (\Pancake\Filesystem\Filesystem::has($file)) {
            force_download($original, \Pancake\Filesystem\Filesystem::read($file));
        } else {
            throw new \Pancake\Filesystem\FileNotFoundException("The file you were trying to access ($file) does not exist in " . implode(", ", \Pancake\Filesystem\Filesystem::getEnabledAdapters()) . ".");
        }
    }

    /**
     * Get client
     */
    private function _get_client($unique_id) {
        $this->load->model('clients/clients_m');
        return empty($unique_id) ? null : $this->clients_m->get_for_kitchen($unique_id);
    }

    public function get_client_support_matrix_json() {
        echo json_encode(get_client_support_matrix($this->input->post('client_id')));
        return;
    }

}

/* End of file: kitchen.php */