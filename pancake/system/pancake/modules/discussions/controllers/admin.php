<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2016, Pancake Payments
 * @license        https://www.pancakeapp.com/license
 * @link           https://www.pancakeapp.com
 * @since          Version 4.12.16
 */

/**
 * The admin controller for discussions.
 *
 * @subpackage     Controllers
 * @category       Discussions
 */
class Admin extends Admin_Controller {

    protected function discussion($item_type, $item_id, $current_comment = null) {
        $this->load->model('kitchen/kitchen_comment_m');
        $this->load->model('clients/clients_m');

        $client_id = $this->kitchen_comment_m->get_type_client_id($item_type, $item_id);

        if (!$client_id) {
            $this->session->set_flashdata("error", __("discussions:does_not_exist"));
            redirect("admin");
        }

        $comments = $this->kitchen_comment_m->get_many_by(array(
            'item_type' => $item_type,
            'item_id' => $item_id,
        ));

        $this->load->model("users/user_m");

        foreach ($comments as $key => $comment) {
            if ($comment->user_id) {
                $comment->user =  $this->user_m->getUserById($comment->user_id);
                $comment->user_name = ($comment->user["first_name"] . ' ' . $comment->user["last_name"]);
            } elseif ($comment->client_id != '0') {
                $comment->client = $this->clients_m->getById($comment->client_id);
                $comment->user_name = client_name($comment->client_id);
            }
        }

        $this->template->chatters = $this->kitchen_comment_m->get_chatters($item_type, $item_id);
        $this->template->client = $this->clients_m->getById($client_id);
        $this->template->client_id = $client_id;
        $this->template->comments = $comments;
        $this->template->current_comment = $current_comment;

        $post_data = $this->session->userdata("last_post_data");
        $this->session->unset_userdata("last_post_data");
        if ($post_data) {
            $this->template->last_inputted_comment = $post_data["comment"];
            $this->template->last_is_private = $post_data["is_private"];
        } else {
            $this->template->last_inputted_comment = "";
            $this->template->last_is_private = true;
        }

        $this->template->build('discussion', [
            'item' => $this->kitchen_comment_m->get_item_details($item_type, $item_id),
            'item_id' => $item_id,
            'item_type' => $item_type,
        ]);
    }

    public function task($item_id) {
        $this->discussion(__FUNCTION__, $item_id);
    }

    public function invoice($item_id) {
        $this->discussion(__FUNCTION__, $item_id);
    }

    public function proposal($item_id) {
        $this->discussion(__FUNCTION__, $item_id);
    }

    public function project($item_id) {
        $this->discussion(__FUNCTION__, $item_id);
    }

    public function client($item_id) {
        $this->discussion(__FUNCTION__, $item_id);
    }

    public function post($item_type, $item_id) {
        $this->load->model('kitchen/kitchen_comment_m');

        $files = new \Symfony\Component\HttpFoundation\FileBag($_FILES);
        $has_files = false;
        if ($files->has("files")) {
            foreach ($files->get("files") as $file) {
                if ($file) {
                    $has_files = true;
                }
            }

            $files = $files->get("files");
        }

        if (empty($this->input->post('comment')) && !$has_files) {
            $this->session->set_flashdata("error", __("discussions:message_cannot_be_empty"));
            redirect('admin/discussions/' . $item_type . '/' . $item_id);
        }

        $client_id = $this->kitchen_comment_m->get_type_client_id($item_type, $item_id);

        if (!$client_id) {
            $this->session->set_flashdata("error", __("discussions:does_not_exist"));
            redirect("admin/discussions/$item_type/$item_id");
        }

        $is_private = $this->input->post('is_private') ? 1 : 0;

        $data = array(
            'item_type' => $item_type,
            'item_id' => $item_id,
            'user_id' => current_user(),
            'comment' => $this->input->post('comment'),
            'user_name' => '',
            'client_id' => $client_id,
            'created' => time(),
            'is_private' => $is_private,
        );

        try {
            $comment_id = $this->kitchen_comment_m->insert_comment($data, $files);

            if ($has_files) {
                $this->load->model('kitchen/kitchen_files_m');
                $this->kitchen_files_m->upload($files, $comment_id, $client_id);
            }

            $message = __($is_private ? "discussions:private_commented_successfully" : "discussions:public_commented_successfully");
            $this->session->set_flashdata("success", $message);
            redirect("admin/discussions/$item_type/$item_id");
        } catch (\Pancake\Filesystem\UploadException $e) {
            $this->session->set_userdata("last_post_data", $this->input->post());
            $this->session->set_flashdata("error", $e->getMessage());
            redirect('admin/discussions/' . $item_type . '/' . $item_id);
        }
    }

    public function edit($comment_id = null) {

        if ($comment_id === null) {
            show_404();
        }

        $this->load->model('kitchen/kitchen_comment_m');

        $comment = $this->db->where('id', $comment_id)->get('comments')->row();

        if (is_admin() || current_user() == $comment->user_id) {
            if ($_POST) {
                $data = [
                    'comment' => $this->input->post('comment'),
                    'is_private' => (bool) $this->input->post('is_private'),
                ];

                if ($this->kitchen_comment_m->update_comment($comment_id, $data, @$_FILES['files'])) {
                    if (isset($_FILES['files'])) {
                        $this->load->model('kitchen_files_m');
                        $this->kitchen_files_m->upload($_FILES['files'], $comment_id, $comment->client_id);
                    }
                }

                $this->session->set_flashdata("success", __("discussions:edited"));
                redirect("admin/discussions/{$comment->item_type}/{$comment->item_id}");
            }

            $this->discussion($comment->item_type, $comment->item_id, $comment);
        } else {
            redirect("admin/discussions/{$comment->item_type}/{$comment->item_id}");
        }
    }

    public function delete($comment_id = null) {

        if ($comment_id === null) {
            show_404();
        }

        $comment = $this->db->where('id', $comment_id)->get('comments')->row();

        if (is_admin() || current_user() == $comment->user_id) {
            $this->db->where('id', $comment_id)->delete('comments');
        } else {
            redirect("admin/discussions/{$comment->item_type}/{$comment->item_id}");
        }

        $this->session->set_flashdata("success", __("discussions:deleted"));
        redirect("admin/discussions/{$comment->item_type}/{$comment->item_id}");
    }

}