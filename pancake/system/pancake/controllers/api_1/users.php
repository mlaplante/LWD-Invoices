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
 * The User API controller
 *
 * @subpackage    Controllers
 * @category      API
 */
class Users extends REST_Controller {
    /**
     * Users Insert Columns
     *
     * @var array
     */
    protected $users_insert_columns = array(
        'username',
        'email',
        'password',
        'group_name',

    );

    /**
     * Users Editable Columns
     *
     * @var array
     */
    protected $users_editable_columns = array(
        'first_name',
        'last_name',
        'company',
        'phone',
        'custom_background',
    );

    /**
     * Users Validation
     *
     * @var array
     */
    public $users_validation = array(
        array(
            'field' => 'username',
            'rules' => 'required',
        ),
        array(
            'field' => 'email',
            'rules' => 'required|valid_email',
        ),
        array(
            'field' => 'password',
            'rules' => 'required',
        ),
    );

    /**
     * Constructor
     */
    public function __construct() {
        parent::__construct();

        // Add the editable columns onto the insert columns
        $this->users_insert_columns = array_merge($this->users_insert_columns, $this->users_editable_columns);
        $this->load->model('users/user_m');
        $this->load->model('ion_auth_model');
    }

    /**
     * Get All Users
     * Parameters:
     *  + limit = 5
     *  + start = 0
     *  + sort_by = email (default: id)
     *  + sort_dir = asc (default: asc)
     *
     * @link   /api/1/users   GET Request
     */
    public function index_get() {
        $sort_by = $this->get('sort_by') ? $this->get('sort_by') : 'id';
        $sort_dir = $this->get('sort_dir') ? $this->get('sort_dir') : 'asc';

        $users = $this->user_m
            ->select('*, null as password, FROM_UNIXTIME(created_on) as created_on, FROM_UNIXTIME(last_login) as last_login', false)
            ->order_by($sort_by, $sort_dir)
            ->limit($this->get('limit'), $this->get('start'))
            ->get_all();

        foreach ($users as &$user) {
            $user->id = (int) $user->id;
            $user->group_id = (int) $user->group_id;
            $user->active = (bool) $user->active;
        }

        $count = count($users);
        $this->response(array(
            'status' => true,
            'message' => "Found $count users",
            'users' => $users,
            'count' => $count,
        ), 200);
    }

    /**
     * Show User
     *
     * @link   /api/1/users/show   GET Request
     */
    public function show_get() {
        if (!$this->get('id')) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $user = $this->user_m
            ->select('*, null as password, FROM_UNIXTIME(created_on) as created_on, FROM_UNIXTIME(last_login) as last_login', false)
            ->get($this->get('id'));

        if (empty($user)) {
            $err_msg = 'This user could not be found.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        } else {
            $user->id = (int) $user->id;
            $user->group_id = (int) $user->group_id;
            $user->active = (bool) $user->active;
            $this->response(array('status' => true, 'user' => $user, 'message' => 'Found user #' . $user->id), 200);
        }
    }

    /**
     * Create New User
     *
     * @link   /api/1/users/new   POST Request
     */
    public function new_post() {
        if (empty($_POST)) {
            $err_msg = 'No details were provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        // Set validation rules above and validate
        if (!$this->user_m->set_validate($this->users_validation)->validate($this->input->post())) {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $this->load->helper('array');
        $user = elements_exist($this->users_insert_columns, $this->input->post());
        foreach (array('username', 'email', 'password') as $key) {
            $$key = $user[$key];
            unset($user[$key]);
        }

        // Default Group Name to admin
        $group_name = 'admin';
        if (isset($user['group_name'])) {
            $group_name = $user['group_name'];
            unset($user['group_name']);
        }

        // Register this user!
        $id = $this->ion_auth_model->register($username, $password, $email, $user, $group_name);

        // Registration Failed
        if (!$id) {
            $this->ion_auth->set_error_delimiters('', '');

            $err_msg = $this->ion_auth->errors();
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        } // Registartion Succeeded
        else {
            $this->response(array('status' => true, 'id' => $id, 'message' => sprintf('User #%s has been created.', $id)), 200);
        }
    }

    /**
     * Edit User
     * The original documented endpoint.
     *
     * @link   /api/1/users/edit    POST Request
     *
     * @param  string   Numeric ID of user
     */
    public function edit_post($id = null) {
        $this->update_post($id);
    }

    /**
     * Update User
     *
     * @deprecated This should stay for backward compatibility
     * @link       /api/1/users/update   POST Request
     *
     * @param  string   Numeric ID of user
     */
    public function update_post($id = null) {
        if (!($id or $id = $this->post('id'))) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        if (!$user = $this->user_m->get($id)) {
            $err_msg = 'This user does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        $this->load->helper('array');
        $input = elements_exist($this->users_editable_columns, $this->input->post());

        if ($this->ion_auth_model->update_user($id, $input)) {
            $this->response(array('status' => true, 'message' => sprintf('User #%d has been updated.', $id)), 200);
        } else {
            $err_msg = current($this->validation_errors());
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }
    }

    function verify_post() {
        $username = $this->post('username');
        $password = $this->post('password');

        if (empty($username)) {
            $err_msg = 'No Username was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $user = $this->db->get_where("users", array("username" => $username))->row_array();

        if (!isset($user['id'])) {
            $user = $this->db->get_where("users", array("email" => $username))->row_array();
        }

        if (!isset($user['id'])) {
            $this->response(array(
                'status' => true,
                'message' => "The user $username does not exist.",
                'user_exists' => false,
                'is_correct_password' => false,
                'user' => null,
            ), 200);
        } else {
            $password = $this->ion_auth_model->hash_password_db($user['username'], $password);

            if (!$password) {
                $this->response(array(
                    'status' => true,
                    'message' => "The password for $username is not valid.",
                    'user_exists' => true,
                    'is_correct_password' => false,
                    'user' => null,
                ), 200);
            }

            $user = $this->db->join("meta", "users.id = user_id")->get_where("users", array(
                "username" => $user['username'],
                "password" => $password,
            ))->row_array();

            if (!isset($user['id'])) {
                $this->response(array(
                    'status' => true,
                    'message' => "The password for $username is not valid.",
                    'user_exists' => true,
                    'is_correct_password' => false,
                    'user' => null,
                ), 200);
            } else {
                $user = array(
                    "id" => $user['id'],
                    "first_name" => $user['first_name'],
                    "last_name" => $user['last_name'],
                    "full_name" => $user['first_name'] . " " . $user['last_name'],
                    "company" => $user['company'],
                    "phone" => $user['phone'],
                    "group_id" => $user['group_id'],
                    "username" => $user['username'],
                    "email" => $user['email'],
                    "last_login" => $user['last_login'],
                );

                $this->response(array(
                    'status' => true,
                    'message' => "The user $username exists and the password is correct.",
                    'user_exists' => true,
                    'is_correct_password' => true,
                    'user' => $user,
                ), 200);
            }
        }
    }

    /**
     * Delete User
     *
     * @link   /api/1/users/delete   POST Request
     *
     * @param  string   Numeric ID of user
     */
    public function delete_post($id = null) {
        if (!($id or $id = $this->post('id'))) {
            $err_msg = 'No id was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        if (!$user = $this->user_m->get($id)) {
            $err_msg = 'This user does not exist!';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        }

        // Ion_auth deletes the meta along with the user
        if ($this->ion_auth_model->delete_user($id)) {
            $this->response(array('status' => true, 'message' => sprintf('User #%d has been deleted.', $id)), 200);
        } else {
            $err_msg = sprintf('Failed to delete user #%d.', $id);
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 500);
        }
    }

}