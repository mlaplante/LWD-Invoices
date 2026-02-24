<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package             Pancake
 * @author              Pancake Dev Team
 * @copyright           Copyright (c) 2014, Pancake Payments
 * @license             http://pancakeapp.com/license
 * @link                http://pancakeapp.com
 * @since               Version 1.0
 */
// ------------------------------------------------------------------------

/**
 * The install wizard controller
 *
 * @subpackage    Controllers
 * @category      Wizard
 * @property Installer $installer
 */
class Wizard extends CI_Controller {

    /**
     * @var    string    The path to the config folder
     */
    private $config_path;

    /**
     * @var    string    The path to the config.php file
     */
    private $config_file;

    /**
     * @var    string    The path to the stripe.php config file
     */
    private $stripe_config_file;

    /**
     * @var    string    The path to the uploads folder
     */
    private $upload_path;

    // ------------------------------------------------------------------------

    public function __construct() {
        parent::__construct();

        # Disable all caching for Varnish.
        header("Expires: Mon, 26 Jul 1997 05:00:00 GMT");
        header("Last-Modified: " . gmdate("D, d M Y H:i:s") . " GMT");
        header("Cache-Control: private");
        header("Pragma: no-cache");

        $this->config_path = FCPATH . 'system/pancake/config';
        $this->config_file = $this->config_path . "/config.php";
        $this->stripe_config_file = $this->config_path . "/stripe.php";
        $this->upload_path = FCPATH . 'uploads/';
        require_once FCPATH . 'system/pancake/helpers/pancake_preload_helper.php';
        require_once FCPATH . 'system/pancake/helpers/pancake_helper.php';
        include_once FCPATH . 'system/pancake/libraries/Asset.php';
        Asset::add_path(APPPATH . 'assets/');
        Asset::set_asset_url(BASE_URL);
    }

    public function _detect_url_rewriting() {
        include_once APPPATH . 'libraries/HTTP_Request.php';
        $http = new HTTP_Request();
        try {
            $url_without_index_php = BASE_URL . "admin";
            $contents = $http->request($url_without_index_php);
            if (stristr($contents, "run the installer") === false) {
                $contents = $http->request(BASE_URL . "index.php/admin");
                if (stristr($contents, "run the installer") === false) {
                    $contents = $http->request(BASE_URL . "index.php?/admin");
                    if (stristr($contents, "run the installer") === false) {
                        # Could not detect any valid way to access Pancake, so assume it works if there's a .htaccess and it's Apache, otherwise default to "index.php".

                        $htaccess_servers = array(
                            "Apache",
                            "LiteSpeed",
                            "WebServerX",
                            "1984",
                        );

                        $use_index_php = "index.php";
                        foreach ($htaccess_servers as $server) {
                            if (strpos($_SERVER["SERVER_SOFTWARE"], $server) !== false) {
                                $use_index_php = is_file(FCPATH . '.htaccess') ? '' : 'index.php';
                            }
                        }
                    } else {
                        # Found "run the installer", works with index.php?.
                        $use_index_php = "index.php?";
                    }

                } else {
                    # Found "run the installer", works with index.php.
                    $use_index_php = "index.php";
                }
            } else {
                # Found "run the installer", works without index.php.
                $use_index_php = "";
            }
        } catch (Exception $e) {
            # Could not detect URL Rewriting correctly; defaulting to "index.php?".
            $use_index_php = "index.php?";
        }

        if ($use_index_php !== $this->config->item("index_page")) {
            if (is_really_writable($this->config_file)) {
                file_put_contents($this->config_file, str_replace("\$config['index_page'] = \$config['index_page'];", "\$config['index_page'] = '$use_index_php'; #CORRECTED", file_get_contents($this->config_file)));
                if (strstr(file_get_contents($this->config_file), "#CORRECTED") !== false) {
                    # Everything is OK; the file was corrected.
                    return true;
                } else {
                    # Something went wrong while updating the file.
                    return false;
                }
            } else {
                # The file can't be corrected.
                return false;
            }
        } else {
            # Everything is OK; detection was correct.
            return true;
        }
    }

    public function _detect_tls12() {
        \Stripe\Stripe::setApiKey("sk_test_BQokikJOvBiI2HlWgH4olfQ2");
        \Stripe\Stripe::$apiBase = "https://api.stripe.com";
        $curl = new \Stripe\HttpClient\CurlClient([CURLOPT_SSLVERSION => CURL_SSLVERSION_TLSv1_2]);
        \Stripe\ApiRequestor::setHttpClient($curl);

        try {
            \Stripe\Charge::all();
            return true;
        } catch (\Stripe\Error\ApiConnection $e) {
            # Try without the CURLOPT.
            $curl = new \Stripe\HttpClient\CurlClient();
            \Stripe\ApiRequestor::setHttpClient($curl);
            try {
                \Stripe\Charge::all();

                # Fix stripe.php config file.
                if (is_really_writable($this->stripe_config_file)) {
                    file_put_contents($this->stripe_config_file, str_replace("[CURLOPT_SSLVERSION => CURL_SSLVERSION_TLSv1_2]", "[]", file_get_contents($this->stripe_config_file)));
                    if (strstr(file_get_contents($this->stripe_config_file), "\$config['stripe_curlopts'] = [];") !== false) {
                        # Everything is OK; the file was corrected.
                        return true;
                    } else {
                        # Something went wrong while updating the file.
                        return false;
                    }
                } else {
                    # The file can't be corrected.
                    return false;
                }
            } catch (\Stripe\Error\ApiConnection $e) {
                # Cannot work with or without the CURLOPT trickery.
                return false;
            }
        }
    }

    public function index() {
        if ($_POST) {
            $this->load->library('form_validation');
            $data = [];

            $this->form_validation->set_rules('db_host', 'Database Host', 'required');
            $this->form_validation->set_rules('db_user', 'Database Username', 'required');
            $this->form_validation->set_rules('db_pass', 'Database Password', 'required');
            $this->form_validation->set_rules('db_name', 'Database Name', 'required');
            $this->form_validation->set_rules('db_port', 'Database Port', 'required');
            $this->form_validation->set_rules('username', 'Username', 'required|xss_clean');
            $this->form_validation->set_rules('password', 'Password', 'required|min_length[5]|matches[password_confirm]');
            $this->form_validation->set_rules('password_confirm', 'Password Confirmation', 'required');

            if ($this->form_validation->run()) {
                $data['hostname'] = $this->input->post('db_host');
                $data['database'] = $this->input->post('db_name');
                $data['dbprefix'] = $this->input->post('dbprefix');
                $data['dbprefix'] = $data['dbprefix'] ? $data['dbprefix'] : 'pancake_';
                $data['username'] = $this->input->post('db_user');
                $data['password'] = $this->input->post('db_pass');
                $data['port'] = $this->input->post('db_port');
                $data['port'] = (!$data['port']) ? '3306' : $data['port'];
                $db = $this->_check_db($data["hostname"], $data["username"], $data["password"], $data["database"], $data["port"]);

                if ($db["success"]) {
                    if ($db["is_installed"]) {
                        $this->_output_step("steps/stop");
                        return;
                    } else {
                        $this->load->library('installer');
                        if ($this->installer->install($data, $this->input->post("username"), $this->input->post("password"))) {
                            # Redirect to Pancake, showing successful install modal.
                            redirect("admin");
                        } else {
                            $data['error'] = "The installer could not store the database configurations. Make sure that system/pancake/config is writable.";
                            $this->_output_step('steps/single_step', $data);
                            return;
                        }
                    }
                } else {
                    $data['error'] = 'Database Error: ' . $db["error"];
                    $this->_output_step('steps/single_step', $data);
                    return;
                }
            } else {
                $this->_output_step('steps/single_step', $data);
                return;
            }
        } else {
            $this->config->load("license");
            $checks = $this->_run_checks();
            if ($checks['can_continue']) {
                $this->_output_step('steps/single_step');
            } else {
                $this->_output_step('steps/checks', $checks);
            }
        }
    }

    public function error() {
        $this->_output_step('error');
    }

    protected function _run_checks() {
        $data = array();
        $data['is_url_rewriting_working'] = $this->_detect_url_rewriting();
        $data['config_writable'] = is_really_writable($this->config_path) ? true : false;
        $data['upload_writable'] = is_really_writable($this->upload_path) ? true : false;
        $data['license_valid'] = $this->_check_license($this->config->item("license_key"));
        $data['curl_installed'] = function_exists('curl_init');
        $data['tls12'] = $this->_detect_tls12();

        $data['installed'] = array(
            'gd' => (extension_loaded('gd') && function_exists('gd_info')),
            'json' => (extension_loaded('json') && function_exists('json_encode')),
            'dom' => (extension_loaded('dom')),
            'xml' => (extension_loaded('xml')),
            'mysql' => (extension_loaded('mysqli') || extension_loaded('mysql')),
        );

        include_once APPPATH . 'libraries/HTTP_Request.php';
        $http = new HTTP_Request();
        try {
            $http->request(MANAGE_PANCAKE_BASE_URL);
            $data['manage_pancakeapp'] = true;
        } catch (Exception $e) {
            $data['manage_pancakeapp'] = false;
        }

        $can_continue = true;
        foreach ($data as $value) {
            if (is_array($value)) {
                foreach ($value as $subvalue) {
                    if (!$subvalue) {
                        $can_continue = false;
                        break 2;
                    }
                }
            } else {
                if (!$value) {
                    $can_continue = false;
                    break;
                }
            }
        }


        $data['can_continue'] = $can_continue;
        return $data;
    }

    protected function _check_db($host, $user, $pass, $name, $port, $prefix = "pancake_") {
        $is_installed = false;

        if (function_exists("mysqli_connect")) {
            $mysqli = @new mysqli($host, $user, $pass, $name, $port);
            $success = !$mysqli->connect_error;
            $error = $mysqli->connect_error;
            if ($success) {
                $is_installed = $mysqli->query("show tables like '" . $mysqli->real_escape_string($prefix) . "%'")->num_rows > 0;
            }
        } else {
            $link = @mysql_connect($host . ':' . $port, $user, $pass, true);

            if ($link) {
                // If the database is not there create it
                mysql_query('CREATE DATABASE IF NOT EXISTS ' . $name, $link);
            }

            $success = ($link && @ mysql_select_db($name, $link));
            $error = mysql_error();

            if ($success) {
                $result = mysql_query("show tables like '" . mysql_real_escape_string($prefix, $link) . "%'", $link);
                $is_installed = mysql_num_rows($result) > 0;
            }
        }

        return [
            "success" => $success,
            "error" => $error,
            "is_installed" => $is_installed,
        ];
    }

    private function _check_license($key) {
        $key = trim($key);

        $result = get_url_contents(MANAGE_PANCAKE_BASE_URL . 'verify/key/' . $key, false);
        if (empty($result)) {
            show_error('Pancake could not verify if the key "' . $key . '" is valid.');
        }

        return ($result === 'valid');
    }

    private function _output_step($view, $data = array()) {
        $content = $this->load->view($view, $data, true);

        $this->load->view('template', array('content' => $content));
    }

}

/* End of file wizard.php */