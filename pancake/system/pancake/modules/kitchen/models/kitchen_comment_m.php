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
 * @since          Version 3.2
 */
// ------------------------------------------------------------------------

/**
 * The Kitchen Comment Model
 *
 * @subpackage    Models
 * @category      Kitchen
 */
class Kitchen_comment_m extends Pancake_Model {

    /**
     * @var    string    The projects table name
     */
    protected $table = 'comments';

    /**
     * @var    array    The array of validation rules
     */
    protected $validate = array(
        array(
            'field' => 'client_id',
            'label' => 'Client',
            'rules' => 'required',
        ),
        array(
            'field' => 'item_type',
            'label' => 'Type',
            'rules' => 'required',
        ),
        array(
            'field' => 'item_id',
            'label' => 'Item',
            'rules' => 'required',
        ),
        array(
            'field' => 'comment',
            'label' => 'Comment',
            'rules' => 'required',
        ),
    );

    // --------------------------------------------------------------------

    /**
     * Retrieves a single comment by its ID
     *
     * @access    public
     *
     * @param    int        The comment id
     *
     * @return    object    The result object
     */
    public function get_comment_by_id($comment_id) {
        $this->db->where('id', $comment_id);
        $this->db->limit(1);

        $query = $this->db->get($this->table);

        if ($query->num_rows() > 0) {
            return $query;
        }
        return false;
    }

    /**
     * Returns a count of all comments belonging to a client
     *
     * @access    public
     *
     * @param   int    The id of the client
     *
     * @return    int
     */
    public function count_all_comments($client_id) {
        return $this->db
            ->where('client_id', $client_id)
            ->count_all_results($this->table);
    }

    public function count_all_client_comments($client_id) {
        return $this->db
            ->where("item_type", "client")
            ->where('item_id', $client_id)
            ->count_all_results($this->table);
    }

    // --------------------------------------------------------------------

    /**
     * Inserts a new comment
     *
     * @access    public
     *
     * @param    array    The comment array
     *
     * @return    int
     */
    public function insert_comment($input, $files = array()) {
        if (!$this->validate($input)) {
            return false;
        }

        $CI = &get_instance();
        $CI->load->model('kitchen/kitchen_files_m');
        $CI->load->model('notifications/notification_m');
        $CI->kitchen_files_m->verify_uploads($files);

        $data = [
            'client_id' => $input['client_id'],
            'user_id' => $input['user_id'],
            'user_name' => $input['user_name'],
            'created' => time(),
            'item_type' => $input['item_type'],
            'item_id' => $input['item_id'],
            'comment' => purify_html($input['comment']),
            'is_private' => $input['is_private'],
        ];
        $comment_id = parent::insert($data);

        if ($input['user_id'] > 0) {
            Notify::user_commented($comment_id, $input['user_id']);
        } else {
            Notify::client_commented($comment_id, $input['client_id']);
        }

        if (!$input['is_private']) {
            # We're leaving a public comment, and the client needs to be able to see it.
            # So we force the item to be viewable.
            $this->make_item_viewable($input['item_type'], $input['item_id']);
        }

        $this->send_notification_email($comment_id, (bool) $input['is_private']);

        return $comment_id;
    }

    /**
     * Updates a new comment
     *
     * @access    public
     *
     * @param    array    The comment array
     *
     * @return    int
     */
    public function update_comment($comment_id, $input, $files = array()) {
        $CI = &get_instance();
        $CI->load->model('kitchen/kitchen_files_m');
        $upload_result = $CI->kitchen_files_m->verify_uploads($files);
        if ($upload_result === NOT_ALLOWED) {
            return false;
        }

        $this->db->where('id', $comment_id)->update($this->table, $input);

        return $comment_id;
    }

    // --------------------------------------------------------------------

    /**
     * Deletes a comment by its ID
     *
     * @access    public
     *
     * @param    int        The comment id
     *
     * @return    object    The result object
     */
    public function delete_comment($comment_id) {
        $this->db->where('id', $comment_id);

        return $this->db->delete($this->table);
    }

    //

    public function send_notification_email($comment_id, $is_private = true) {

        $this->load->model('clients/clients_m');

        $comment = $this->get($comment_id);
        $client = (array) $this->clients_m->get($comment->client_id);

        $comment->url = site_url(Settings::get('kitchen_route') . '/' . $client['unique_id'] . '/comments/' . $comment->item_type . '/' . $comment->item_id);

        $comment->comment = nl2br($comment->comment);

        if ($comment->user_id) {
            $this->load->model("users/user_m");
            $comment->user =  $this->user_m->getUserById($comment->user_id);
            $comment->user_name = ($comment->user["first_name"] . ' ' . $comment->user["last_name"]);
        } elseif ($comment->client_id != '0') {
            $this->load->model("clients/clients_m");
            $comment->client = $this->clients_m->getById($comment->client_id);
            $comment->user_name = client_name($comment->client_id);
        }

        $parser_array = array(
            'comment' => (array) $comment,
        );

        $details = $this->get_item_details($comment->item_type, $comment->item_id);
        $is_viewable_status = $details["is_viewable"];
        $parser_array['item'] = $details["title"];

        $to = array();

        # Always send comments to the admin.
        $to[] = Business::getNotifyEmail();

        # Send comment to anyone chatting on this item, except the current user.
        $chatters = $this->get_chatters($comment->item_type, $comment->item_id);
        foreach ($chatters as $user) {
            if (logged_in() && current_user() == $user["id"]) {
                continue;
            }

            $to[] = $user["email"];
        }

        # Send the comment to the client, but only if the item is viewable in the client area,
        # and the comment is NOT private, and it's a logged in user that's making the comment, not the client.
        if ($is_viewable_status and !$is_private and logged_in()) {
            $to[] = $client['email'];
        }

        # Do not send the same notification to the same email more than once.
        # This could happen if, for example, the email of the assigned user for a task
        # matches the Business::getNotifyEmail().
        $to = array_unique($to);

        if (count($to) > 0) {
            $return = Pancake\Email\Email::send(array(
                'to' => $to,
                'template' => 'new_comment',
                'client_id' => $client['id'],
                'data' => $parser_array,
            ));
        } else {
            $return = true;
        }

        return $return;
    }

    protected function process_result($row) {
        # Don't process invalid results. Fixes #31256.
        if (empty($row)) {
            return $row;
        }

        $this->load->model('clients/clients_m');
        $row->files = $this->get_files($row->id);
        $client_unique_id = $this->clients_m->getUniqueIdById($row->client_id);

        # This is called url_for_logged_in_users to emphasize that it is NOT
        # for clients. This is because of the way task URLs are handled (in-admin).
        if ($row->item_type == 'task') {
            $row->url_for_logged_in_users = site_url("admin/projects/tasks/discussion/" . $row->item_id);
        } else {
            $row->url_for_logged_in_users = site_url(Settings::get('kitchen_route') . '/' . $client_unique_id . '/comments/' . $row->item_type . '/' . $row->item_id);
        }

        return $row;
    }

    public function get_item_details($item_type, $item_id) {
        $is_viewable_status = false;
        $title = __("global:na");
        $exists = false;

        switch ($item_type) {
            case 'invoice':
            case 'estimate':
            case 'credit_note':
                $this->load->model('invoices/invoice_m');
                $invoice = (array) $this->invoice_m->get_by('id', $item_id);

                $exists = isset($invoice["is_viewable"]);
                if (!$exists) {
                    break;
                }

                $is_viewable_status = $invoice['is_viewable'];
                switch ($invoice['type']) {
                    case "ESTIMATE":
                        $title = __('estimates:estimatenumber', [$invoice['invoice_number']]);
                        break;
                    case "CREDIT_NOTE":
                        $title = __('credit_notes:credit_note_number', [$invoice['invoice_number']]);
                        break;
                    default:
                        $title = __('invoices:invoicenumber', [$invoice['invoice_number']]);
                        break;
                }
                break;

            case 'project':
                $this->load->model('projects/project_m');
                $project = (array) $this->project_m->get_by('id', $item_id);

                $exists = isset($project["is_viewable"]);
                if (!$exists) {
                    break;
                }

                $is_viewable_status = $project['is_viewable'];
                $title = __('global:project') . ': ' . $project['name'];
                break;

            case 'task':
                $this->load->model('projects/project_task_m');
                $this->load->model('projects/project_m');
                $task = (array) $this->project_task_m->get_by('id', $item_id);

                $exists = isset($task["is_viewable"]);
                if (!$exists) {
                    break;
                }

                $project = (array) $this->project_m->get_by('id', $task['project_id']);

                # Only viewable if both the project AND the task are viewable.
                $is_viewable_status = $project['is_viewable'] ? $task['is_viewable'] : false;
                $title = $project['name'] . ' : <br />' . $task['name'];
                break;

            case 'proposal':
                $this->load->model('proposals/proposals_m');
                $proposal = (array) $this->proposals_m->get_by('id', $item_id);
                $exists = isset($proposal["is_viewable"]);
                if (!$exists) {
                    break;
                }

                $is_viewable_status = $proposal['is_viewable'];
                $title = __('global:proposal') . ' #' . $proposal['proposal_number'] . ': ' . $proposal['title'];
                break;
            case 'client':
                $is_viewable_status = true;
                $title = client_name($item_id);
                $exists = ($title !== __("global:na"));
                break;
            default:
                throw new Exception("Unknown comment item type '$item_type'.");
                break;
        }

        return [
            "title" => $title,
            "exists" => $exists,
            "is_viewable" => $is_viewable_status,
        ];
    }

    public function make_item_viewable($item_type, $item_id) {
        $details = $this->get_item_details($item_type, $item_id);

        if ($details["is_viewable"]) {
            # Already viewable.
            return;
        }

        switch ($item_type) {
            case 'invoice':
            case 'estimate':
            case 'credit_note':
                $this->load->model('invoices/invoice_m');
                $this->invoice_m->set_viewable($item_id, true);
                break;
            case 'project':
                $this->load->model('projects/project_m');
                $project = (array) $this->project_m->set_viewable($item_id, true);
                break;
            case 'task':
                $this->load->model('projects/project_m');
                $this->load->model('projects/project_task_m');
                $this->project_task_m->set_viewable($item_id, true);
                break;
            case 'proposal':
                $this->load->model('proposals/proposals_m');
                $this->proposals_m->set_viewable($item_id, true);
                break;
            default:
                throw new Exception("Unknown comment item type '$item_type'.");
                break;
        }
    }

    public function get($id) {
        $row = parent::get($id);
        return $this->process_result($row);
    }

    public function get_by() {
        $row = call_user_func_array('parent::get_by', func_get_args());
        return $this->process_result($row);
    }

    public function get_all() {
        $result = parent::get_all();
        foreach ($result as $key => $row) {
            $result[$key] = $this->process_result($row);
        }
        return $result;
    }

    public function get_files($comment_id) {
        $this->load->model('kitchen/kitchen_files_m');
        $files = $this->kitchen_files_m->get_many_by('comment_id', $comment_id);
        return $files;
    }

    public function where_not_orphan() {
        $this->db->where("
IF(item_type = 'task',
	(select count(*) from " . $this->db->dbprefix("project_tasks") . " where id = item_id),
	IF(item_type = 'invoice',
		(select count(*) from " . $this->db->dbprefix("invoices") . " where id = item_id),
		IF(item_type = 'project',
			(select count(*) from " . $this->db->dbprefix("projects") . " where id = item_id),
			IF (item_type = 'proposal',
				(select count(*) from " . $this->db->dbprefix("proposals") . " where id = item_id),
				null
			)
		)
	)
) = 1
", null, false);
    }

    public function get_for_dashboard($x = 6) {
        $this->where_not_orphan();
        $result = $this->db->order_by('created', 'desc')->limit($x)->get('comments')->result();
        foreach ($result as $key => $row) {
            $result[$key] = $this->process_result($row);
        }

        return $result;
    }

    public function display_comment($comment) {
        if ($comment == strip_tags($comment)) {
            # Old-style non-HTML comment. Process.
            $comment = auto_typography(auto_link($comment, 'url'));
        }

        return purify_html($comment);
    }

    public function get_type_client_id($item_type, $item_id) {
        $mapping = [
            "task" => "project_tasks",
            "invoice" => "invoices",
            "project" => "projects",
            "client" => "clients",
            "proposal" => "proposals",
        ];

        if ($item_type == "invoice") {
            $client_from_invoices = get_client("invoices", $item_id);
            $client_from_estimates = get_client("estimates", $item_id);
            return $client_from_invoices ? $client_from_invoices : $client_from_estimates;
        }

        return get_client($mapping[$item_type], $item_id);
    }

    public function get_chatters($item_type, $item_id) {
        $buffer = $this->db
            ->select("user_id")
            ->distinct()
            ->where("item_type", $item_type)
            ->where("item_id", $item_id)
            ->where("user_id >", 0)
            ->where("user_id is not null", null)
            ->get("comments")
            ->result_array();

        $users = [];
        foreach ($buffer as $row) {
            $user_id = (int) $row["user_id"];
            $users[$user_id] = $user_id;
        }

        $this->load->model('users/user_m');

        if ($item_type == 'task') {
            $this->load->model("projects/project_task_m");
            $task = $this->project_task_m->get_task_by_id($item_id)->row_array();
            $user_id = $task['assigned_user_id'];
            $users[$user_id] = $user_id;
        }

        return $this->user_m->get_users_by_ids($users);
    }

}

/* End of file: kitchen_comment_m.php */
