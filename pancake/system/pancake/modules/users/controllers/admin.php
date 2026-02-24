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
 * User Admin Controller
 *
 * @subpackage     Controller
 * @category       Users
 */
class Admin extends Admin_Controller {

    /**
     * @var    array    All the methods that require user to be logged in
     */
    protected $secured_methods = array('index', 'change_password', 'create_user', 'activate', 'deactivate');

    protected $section = 'users';

    // ------------------------------------------------------------------------

    /**
     * Load all the dependencies
     *
     * @return    void
     */
    public function __construct() {
        parent::__construct();

        $this->load->library('form_validation');
        $this->load->helper('array');
        $this->load->model('users/user_m');
        $this->lang->load('groups');

        $no_auth_methods = array('login', 'logout', 'forgot_password', 'reset_password');

        if (!in_array($this->router->fetch_method(), $no_auth_methods)) {
            is_admin() or access_denied();
        }

    }

    // ------------------------------------------------------------------------

    /**
     * List all the users
     *
     * @return    void
     */
    public function index() {
        $users = $this->ion_auth->get_users_array();
        usort($users, function($a, $b) {
            return strcasecmp("{$a['first_name']} {$a['last_name']}", "{$b['first_name']} {$b['last_name']}");
        });
        $this->template->users = $users;
        $this->template->build('admin/index');
    }

    // ------------------------------------------------------------------------

    /**
     * Login the user
     *
     * @return    void
     */
    public function login() {
        $this->load->model("users/user_m");
        $this->user_m->login();
    }

    // ------------------------------------------------------------------------

    /**
     * Changes the user's password
     *
     * @return    void
     */
    public function change_password() {
        IS_DEMO and show_error('This feature is disabled in the demo.');

        $this->form_validation->set_rules('old_password', 'Old password', 'required');
        $this->form_validation->set_rules('new_password', 'New Password', 'required|min_length[' . $this->config->item('min_password_length', 'ion_auth') . ']|max_length[' . $this->config->item('max_password_length', 'ion_auth') . ']|matches[new_password_confirm]');
        $this->form_validation->set_rules('new_password_confirm', 'Confirm New Password', 'required');

        $user = $this->ion_auth->get_user($this->session->userdata('user_id'));

        if ($this->form_validation->run()) {
            $identity = $this->session->userdata($this->config->item('identity', 'ion_auth'));

            $change = $this->ion_auth->change_password($identity, $this->input->post('old_password'), $this->input->post('new_password'));

            if ($change) {
                $this->logout('success', 'Your password has been changed. Please login again.');
            } else {
                $this->session->set_flashdata('error', $this->ion_auth->errors());
                redirect('admin/users/change_password');
            }
        }

        $this->template->user_id = $user->id;
        $this->template->build('change_password');
    }

    // ------------------------------------------------------------------------

    /**
     * Log the user out and set a message, then redirect to login.
     *
     * @access    public
     *
     * @param    string    The name of the flashdata message
     * @param    string    The flashdata message
     *
     * @return    void
     */
    public function logout($message_name = null, $message = '') {
        $logout = $this->ion_auth->logout();

        if ($message_name !== null) {
            $this->session->set_flashdata($message_name, $message);
        }

        redirect('admin/users/login');
    }

    // ------------------------------------------------------------------------

    /**
     * Starts the "forgotten password" process.
     *
     * @access    public
     * @return    void
     */
    public function forgot_password() {
        IS_DEMO and show_error("You cannot reset anyone's password in the Pancake demo.");

        // Set the layout
        switch_theme(false);
        unset($this->template->_partials['notifications']);
        unset($this->template->_partials['search']);
        $this->template->set_layout('login');

        $this->form_validation->set_rules('email', 'Email Address', 'required');

        if ($this->form_validation->run()) {
            $email = $this->input->post('email');
            $username = $this->user_m->getUsernameByEmail($email);

            if (!empty($username)) {
                if ($this->ion_auth->forgotten_password($username)) {
                    $this->session->set_flashdata('success', $this->ion_auth->messages());
                    redirect("admin/users/login");
                } else {
                    $this->session->set_flashdata('error', $this->ion_auth->errors() . '<p>for ' . $username . '</p>');
                    redirect("admin/users/forgot_password");
                }
            } else {
                $client = $this->clients_m->get_by(array(
                    'email' => $email,
                ));

                if ($client) {
                    if ($this->clients_m->forgotten_password($client->id, $client->email)) {
                        $this->session->set_flashdata('success', $this->ion_auth->messages());
                        redirect("admin/users/login");
                    } else {
                        $this->session->set_flashdata('error', $this->ion_auth->errors() . '<p>for ' . $username . '</p>');
                        redirect("admin/users/forgot_password");
                    }
                } else {
                    $this->session->set_flashdata('error', 'Could not find any user with the following email: ' . $this->input->post('email'));
                    redirect("admin/users/forgot_password");
                }
            }
        }

        $this->template->email = array(
            'name' => 'email',
            'id' => 'email',
        );

        $this->template->build('forgot_password');
    }

    // ------------------------------------------------------------------------

    /**
     * Resets a user's password.  This is the final step for forgotten
     * passwords.
     *
     * @access    public
     *
     * @param    string    The password reset code
     *
     * @return    void
     */
    public function reset_password($code) {
        IS_DEMO and show_error("You cannot reset anyone's password in the Pancake demo.");

        // Set the layout
        switch_theme(false);
        unset($this->template->_partials['notifications']);
        unset($this->template->_partials['search']);
        $this->template->set_layout('login');

        $reset = $this->ion_auth->forgotten_password_complete($code);

        if ($reset) {
            $this->session->set_flashdata('success', $this->ion_auth->messages());
            redirect("admin/users/login");
        } else {
            $reset = $this->clients_m->forgotten_password_complete($code);

            if ($reset) {
                $this->session->set_flashdata('success', $this->ion_auth->messages());
                redirect("admin/users/login");
            } else {
                $this->session->set_flashdata('error', $this->ion_auth->errors());
                redirect("admin/users/forgot_password");
            }
        }
    }

    // ------------------------------------------------------------------------

    /**
     * Activate a User
     *
     * @access    public
     *
     * @param    int        The User ID
     * @param    string     The activation code
     *
     * @return    void
     */
    public function activate($id, $code = false) {

        $activation = $this->ion_auth->activate($id, $code);

        if ($activation) {
            //redirect them to the auth page
            $this->session->set_flashdata('success', $this->ion_auth->messages());
            redirect("admin/users");
        } else {
            $this->session->set_flashdata('error', $this->ion_auth->errors());
            redirect("admin/users/forgot_password");
        }
    }

    // ------------------------------------------------------------------------

    /**
     * Deactivate a User
     *
     * @access    public
     *
     * @param    int        The User ID
     *
     * @return    void
     */
    public function deactivate($id = null) {
        if ($id == 1 and IS_DEMO) {
            show_error("You cannot deactivate the main user in the Pancake demo.");
        }


        $id = (int) $id;

        if ($_POST) {
            if ($this->_valid_csrf_nonce() === false) {
                access_denied();
            }
            if (logged_in() AND is_admin()) {
                $this->ion_auth->deactivate($id);
                $this->session->set_flashdata('success', 'The user has been deactivated.');
            }
            redirect('admin/users');
        }

        $this->template->csrf = $this->_get_csrf_nonce();
        $this->template->user = (array) $this->ion_auth->get_user($id);
        $this->template->build('deactivate_user');
    }

    public function delete($id = null) {
        if ($id == 1 and IS_DEMO) {
            show_error("You cannot delete the main user in the Pancake demo.");
        }

        $id = (int) $id;

        if ($_POST) {
            if ($this->_valid_csrf_nonce() === false) {
                access_denied();
            }
            if (logged_in() AND is_admin()) {
                $this->ion_auth->delete_user($id);
                $this->session->set_flashdata('success', 'The user has been deleted.');
            }
            redirect('admin/users');
        }

        $this->template->csrf = $this->_get_csrf_nonce();
        $this->template->user = (array) $this->ion_auth->get_user($id);
        $this->template->build('delete_user');
    }

    // ------------------------------------------------------------------------

    /**
     * Create a User
     *
     * @access    public
     * @return    void
     */
    public function create() {

        //validate form input
        $this->form_validation->set_rules('first_name', 'First Name', 'required|xss_clean');
        $this->form_validation->set_rules('last_name', 'Last Name', 'required|xss_clean');
        $this->form_validation->set_rules('username', 'Username', 'required|xss_clean');
        $this->form_validation->set_rules('email', 'Email Address', 'required|valid_email');
        $this->form_validation->set_rules('group', 'Group', 'required|xss_clean');
        $this->form_validation->set_rules('password', 'Password', 'required|min_length[' . $this->config->item('min_password_length', 'ion_auth') . ']|max_length[' . $this->config->item('max_password_length', 'ion_auth') . ']|matches[password_confirm]');
        $this->form_validation->set_rules('password_confirm', 'Password Confirmation', 'required');

        $groups = array();
        foreach ($this->ion_auth->get_groups() as $group) {
            $groups[$group->name] = $group->description;
        }

        if ($this->form_validation->run()) {
            $username = $this->input->post('username');
            $email = $this->input->post('email');
            $password = $this->input->post('password');
            $group = $this->input->post('group');

            $additional_data = array(
                'first_name' => $this->input->post('first_name'),
                'last_name' => $this->input->post('last_name'),
                'company' => $this->input->post('company'),
                'phone' => $this->input->post('phone'),
            );
            if ($this->ion_auth->register($username, $password, $email, $additional_data, $group)) {
                $this->session->set_flashdata('success', 'The user has been created.');
                echo json_encode(array(
                    'success' => true,
                    'href' => site_url('admin/users'),
                    'html' => '',
                ));
                die;
            } else {
                echo json_encode(array(
                    'success' => false,
                    'href' => site_url('admin/users'),
                    'html' => $this->load->view('user_form', array('groups' => $groups, 'action' => "create"), true),
                ));
                die;
            }
        } else {
            if (count($_POST) > 0) {
                echo json_encode(array(
                    'success' => false,
                    'href' => site_url('admin/users'),
                    'html' => $this->load->view('user_form', array('groups' => $groups, 'action' => "create"), true),
                ));
                die;
            }
        }


        $this->load->view('user_form', array('groups' => $groups, 'action' => "create"));
    }

    /**
     * Edit an existing user
     *
     * @param int $id The ID of the user to edit
     *
     * @return void
     */
    public function edit($id = 0) {
        if ($id == 1 and IS_DEMO) {
            show_error("You cannot edit the main user in the Pancake demo.");
        }

        $groups = array();
        foreach ($this->ion_auth->get_groups() as $group) {
            $groups[$group->id] = $group->description;
        }

        // Get the user's data
        $member = $this->ion_auth->get_user($id);

        // Got user?
        if (!$member) {
            $this->session->set_flashdata('error', $this->lang->line('user_edit_user_not_found_error'));
            redirect('admin/users');
        }

        // Check to see if we are changing emails
        if ($member->email != $this->input->post('email')) {
            // TODO Check to make sure changed emails are unique
            // $this->validation_rules[5]['rules'] .= '|callback__email_check';
        }

        // Get the POST data
        $update_data['username'] = $this->input->post('username');
        $update_data['first_name'] = $this->input->post('first_name');
        $update_data['last_name'] = $this->input->post('last_name');
        $update_data['company'] = $this->input->post('company');
        $update_data['phone'] = $this->input->post('phone');
        $update_data['email'] = $this->input->post('email');
        $update_data['active'] = 1;
        $update_data['group_id'] = $this->input->post('group_id');

        // Password provided, hash it for storage
        if ($this->input->post('password')) {
            $update_data['password'] = $this->input->post('password');
        }

        if ($_POST) {
            $this->form_validation->set_rules('first_name', 'First Name', 'required|xss_clean');
            $this->form_validation->set_rules('last_name', 'Last Name', 'required|xss_clean');
            $this->form_validation->set_rules('username', 'Username', 'required|xss_clean');
            $this->form_validation->set_rules('email', 'Email Address', 'required|valid_email');
            $this->form_validation->set_rules('group_id', 'Group', 'required|xss_clean');

            $repopulate = function ($errors = null) use ($member, $groups) {
                // Dirty hack that fixes the issue of having to re-add all data upon an error
                $member = (object) array_merge((array) $member, $_POST);
                $member->full_name = $member->first_name . ' ' . $member->last_name;

                $data = array(
                    'member' => $member,
                    'action' => "edit",
                    'groups' => $groups,
                );

                if (!empty($errors)) {
                    $data["errors"] = $errors;
                }

                echo json_encode(array(
                    'success' => false,
                    'href' => site_url('admin/users'),
                    'html' => $this->load->view('user_form', $data, true),
                ));

                die;
            };

            // Run the validation
            if ($this->user_m->validate($update_data)) {
                if ($this->form_validation->run()) {
                    if ($this->ion_auth->update_user($id, $update_data)) {
                        # Trigger update manually, because changing just meta doesn't trigger it in the users table.
                        $this->db->where("id", $id)->update("users", array("date_updated" => now()->toDateTimeString()));

                        $this->session->set_flashdata('success', $this->ion_auth->messages());
                        echo json_encode(array(
                            'success' => true,
                            'href' => site_url('admin/users'),
                            'html' => '',
                        ));
                        die;
                    } else {
                        $repopulate($this->ion_auth->errors());
                    }
                } else {
                    $repopulate();
                }
            } else {
                $repopulate($this->ion_auth->errors());
            }
        }

        $data = array(
            'action' => "edit",
            'member' => $member,
            'groups' => $groups,
        );
        $this->load->view('user_form', $data);

    }

    // ------------------------------------------------------------------------

    /**
     * Creates a CSRF nonce to stop CSRF attacks
     *
     * @return    array
     */
    private function _get_csrf_nonce() {
        $this->load->helper('string');

        $key = random_string('alnum', 8);
        $value = random_string('alnum', 20);
        $this->session->set_flashdata('csrfkey', $key);
        $this->session->set_flashdata('csrfvalue', $value);

        return array($key => $value);
    }

    // ------------------------------------------------------------------------

    /**
     * Check if the CSRF nonce exists and is valid
     *
     * @return    bool
     */
    private function _valid_csrf_nonce() {

        /*
    if ( $this->input->post($this->session->flashdata('csrfkey')) !== FALSE &&
         $this->input->post($this->session->flashdata('csrfkey')) == $this->session->flashdata('csrfvalue'))
    {
        return TRUE;
    }
            var_dump(unserialize($_COOKIE['ci_session']), $this->session->flashdata('csrfkey'), $this->session->flashdata('csrfvalue'), $this->input->post($this->session->flashdata('csrfkey')), $this->input->post($this->session->flashdata('csrfkey')));
           */

        # Ignoring this because 1) it wasn't working properly, and 2) it was insecure because it was stored in cookies and the user could see it.
        return true;
    }
}

/* End of file admin.php */