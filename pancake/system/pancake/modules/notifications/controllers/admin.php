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
 * The admin controller for Clients
 *
 * @subpackage    Controllers
 * @category      Clients
 */
class Admin extends Admin_Controller {
    /**
     * The construct doesn't do anything useful right now.
     *
     * @access    public
     * @return    void
     */
    public function __construct() {
        parent::__construct();
        $this->load->model('notification_m');
    }

    public function get_unseen() {

        if (!IS_AJAX && !IS_DEBUGGING) {
            # Send the user back to where he or she should be:
            if (isset($_SERVER["HTTP_REFERER"])) {
                redirect($_SERVER["HTTP_REFERER"]);
            } else {
                redirect('admin');
            }
        }

        if (!is_admin()) {
            echo json_encode(array());
            return;
        }

        $ids = isset($_REQUEST["ids_on_screen"]) ? $_REQUEST["ids_on_screen"] : [];

        $notifications = $this->notification_m->get_unseen();
        $seen_notifications = $this->notification_m->get_seen_ids($ids);

        if ($ids && count($ids)) {
            foreach ($notifications as $key => $value) {

                if (in_array($value->id, $ids)) {
                    unset($notifications[$key]);
                }
            }
        }

        header("Content-Type: application/json");
        echo json_encode([
            "new_notifications" => $notifications,
            "seen_notifications" => $seen_notifications,
        ], IS_DEBUGGING ? JSON_PRETTY_PRINT : 0);
    }

    public function mark_all_as_seen() {
        if (!is_admin()) {
            return;
        }

        foreach ($this->notification_m->get_many_by(["seen" => false]) as $row) {
            $this->notification_m->update($row->id, array('seen' => true));
        }

        echo json_encode(["success" => true], JSON_PRETTY_PRINT);
    }

    public function mark_as_seen() {

        if (!is_admin()) {
            return;
        }

        $id = $this->input->post('id');
        $this->notification_m->update($id, array('seen' => true));
    }
}

/* End of file: admin.php */