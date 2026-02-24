<?php

use GuzzleHttp\Exception\RequestException;

defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Displays an "Access Denied" page.
 *
 * @access    public
 * @return    void
 */
function access_denied() {
    if (logged_in()) {
        $CI = get_instance();
        echo $CI->template->build('partials/access_denied', array(), true);
        die;
    } else {
        show_404();
    }
}

/**
 * Fixes UTF-8 Encoding errors in PDFs.
 * Use in everything that's ever going to be displayed in a PDF. Seriously.
 * Leaves the HTML intact (for those who added it on purpose) and doesn't affect the HTML view.
 *
 * @param string $str
 *
 * @return string
 */
function escape($str) {
    return htmlspecialchars_decode(htmlentities($str, ENT_COMPAT, "UTF-8"));
}

/**
 * Escape a string for output in HTML.
 *
 * @param string $str
 * @return string
 */
function html($str)
{
    return htmlentities($str, ENT_QUOTES | ENT_HTML5 | ENT_SUBSTITUTE | ENT_DISALLOWED, "UTF-8", false);
}

/**
 * Unescape a string that was escaped for output in HTML.
 *
 * @param string $str
 * @return string
 */
function unhtml($str)
{
    return html_entity_decode($str, ENT_QUOTES | ENT_HTML5, "UTF-8");
}

function purify_html($dirty_html) {
    static $purifier = null;

    if ($purifier === null) {
        $config = HTMLPurifier_Config::createDefault();

        if (!is_dir(PANCAKE_TEMP_DIR . 'htmlpurifier')) {
            @mkdir(PANCAKE_TEMP_DIR . 'htmlpurifier', 0777, true);
        }

        if (file_exists(PANCAKE_TEMP_DIR . "htmlpurifier")) {
            $config->set('Cache.SerializerPath', PANCAKE_TEMP_DIR . "htmlpurifier");
        } else {
            $config->set('Cache.DefinitionImpl', null);
        }

        $purifier = new HTMLPurifier($config);
    }

    return $purifier->purify($dirty_html);
}

function current_user() {
    $CI = &get_instance();
    return $CI->current_user ? $CI->current_user->id : 0;
}

function get_user_full_name_by_id($user_id) {
    $CI = &get_instance();
    $CI->load->model('users/user_m');
    return $CI->user_m->get_full_name($user_id);
}

function get_all_users() {
    $CI = &get_instance();
    $CI->load->model('users/user_m');
    return $CI->user_m->get_all_with_meta();
}

function get_client_unique_id_by_id($client_id) {
    $CI = &get_instance();
    $CI->load->model('clients/clients_m');
    return $CI->clients_m->getUniqueIdById($client_id);
}

/**
 * Sets the appropriate JSON header, the status header, then
 * encodes the output and exits execution with the JSON.
 *
 * @access    public
 *
 * @param    mixed      The output to encode
 * @param    int        The status header
 *
 * @return    void
 */
function output_json($output, $status = 200) {
    if (headers_sent()) {
        show_error(__('Headers have already been sent.'));
    }

    PAN::$CI->output->set_status_header($status);
    PAN::$CI->output->set_header('Content-type: application/json');
    exit(json_encode($output));
}

/**
 * Replaces PHP's file_get_contents in URLs, to get around the allow_url_fopen limitation.
 * Still loads regular files using file_get_contents.
 *
 * @param string $url
 *
 * @return string
 */
function get_url_contents($url, $redirect = true, $referer = null) {

    # Check if $referer is actually a stream context provided by dompdf.
    if (is_resource($referer)) {
        $options = stream_context_get_options($referer);
        if (isset($options['http']['header'])) {
            $headers = explode("\n", $options['http']['header']);
            foreach ($headers as $header) {
                $header = explode(":", $header);
                if ($header[0] == "Referer") {
                    $referer = trim($header[1]);
                }
            }
        }
    }

    if (empty($url)) {
        return '';
    }

    # First, let's check whether this is a local file.

    if (stristr($url, FCPATH) !== false) {
        return file_get_contents($url);
    }

    # Decode the URL to deal with spaces and other such things.
    $original_url = $url;
    $url = urldecode($url);

    # This is for PDFs, to bypass the need for an external request.
    $config = array();

    if (!file_exists(APPPATH . 'config/template.php')) {
        include APPPATH . '../system/pancake/config/template.php';
    } else {
        include APPPATH . 'config/template.php';
    }

    $theme_location = $config['theme_locations'][0];
    $fcpath = FCPATH;
    $base_url = BASE_URL;

    $buffer = str_ireplace($fcpath, '', $theme_location);
    $buffer = $base_url . $buffer;

    # Check if it's in third_party/themes.
    if (substr($url, 0, strlen($buffer)) == $buffer) {
        $path_without_buffer = substr($url, strlen($buffer), strlen($url) - strlen($buffer));
        $path_without_version = explode('?', $path_without_buffer);
        $path_without_version = $path_without_version[0];
        $path = $theme_location . $path_without_version;

        if (file_exists($path)) {
            return file_get_contents(urldecode($path));
        }
    }

    # Check if it's in uploads.
    $buffer = $base_url . 'uploads/';
    if (substr($url, 0, strlen($buffer)) == $buffer) {
        $path_without_buffer = substr($url, strlen($buffer), strlen($url) - strlen($buffer));
        $path_without_version = explode('?', $path_without_buffer);
        $path_without_version = $path_without_version[0];
        $path = FCPATH . 'uploads/' . $path_without_version;
        if (file_exists($path)) {
            return file_get_contents(urldecode($path));
        }
    }

    # Check if it's in our Filesystem.
    # This is before the 'main directory' check because URLs can be index.php?/files/fetch/etc.
    $buffer = site_url("files/fetch/");
    if (substr($url, 0, strlen($buffer)) == $buffer) {
        $path_without_buffer = substr($url, strlen($buffer), strlen($url) - strlen($buffer));
        $path_without_version = explode('?', $path_without_buffer);
        $path_without_version = $path_without_version[0];
        $path_without_version = urldecode($path_without_version);

        $suffix = "/fetch";
        if (substr($path_without_version, -strlen($suffix)) == $suffix) {
            $path_without_version = substr($path_without_version, 0, -strlen($suffix));
        }

        if (\Pancake\Filesystem\Filesystem::has($path_without_version)) {
            return \Pancake\Filesystem\Filesystem::read($path_without_version);
        }
    }

    # Check if it's in the main directory.
    $buffer = $base_url;
    if (substr($url, 0, strlen($buffer)) == $buffer) {
        $path_without_buffer = substr($url, strlen($buffer), strlen($url) - strlen($buffer));
        $path_without_version = explode('?', $path_without_buffer);
        $path_without_version = $path_without_version[0];
        $path = FCPATH . $path_without_version;

        # We use the @ here to avoid "open_basedir restriction in effect" errors.
        # See #29892 - Bruno
        if (@file_exists($path)) {
            return file_get_contents(urldecode($path));
        }
    }

    # Check if it's Custom CSS.
    $frontend_css_url = site_url("frontend_css");
    $backend_css_url = site_url("admin/dashboard/backend_css");
    $is_frontend_css = substr($url, 0, strlen($frontend_css_url)) == $frontend_css_url;
    $is_backend_css = substr($url, 0, strlen($backend_css_url)) == $backend_css_url;
    if ($is_frontend_css || $is_backend_css) {
        return Settings::get($is_frontend_css ? 'frontend_css' : 'backend_css');
    }

    if (substr($url, 0, 7) != 'http://' && substr($url, 0, 8) != 'https://') {
        return file_get_contents($url);
    } else {
        if (!file_exists(PANCAKE_TEMP_DIR . 'dompdf/')) {
            @mkdir(PANCAKE_TEMP_DIR . 'dompdf/');
        }

        $cache_filename = PANCAKE_TEMP_DIR . 'dompdf/' . md5($original_url);
        $host = parse_url($original_url, PHP_URL_HOST);
        $cache = false;
        if (in_array($host, ["fonts.googleapis.com", "fonts.gstatic.com", "i.28hours.org"])) {
            # This request should be cached for up to 90 days.
            if (is_dir(PANCAKE_TEMP_DIR . 'dompdf')) {
                $cache = true;
            } else {
                $result = @mkdir(PANCAKE_TEMP_DIR . 'dompdf', 0777, true);
                if ($result) {
                    $cache = true;
                }
            }
        }

        if ($cache && file_exists($cache_filename) && now()->subDays(90)->lt(\Carbon\Carbon::createFromTimestampUTC(filemtime($cache_filename)))) {
            # The file exists in the cache and is less than 90 days old.
            return file_get_contents($cache_filename);
        } else {
            $guzzle = get_guzzle_instance([
                "headers" => [
                    "Referer" => $referer,
                ],
            ]);

            try {
                $response = $guzzle->get($original_url);
                $result = $response->getBody()->getContents();

                # We always cache because in case the file is ever unavailable we want to load the cached version (even if outdated).
                file_put_contents($cache_filename, $result);

                return $result;
            } catch (\GuzzleHttp\Exception\RequestException $e) {
                if (file_exists($cache_filename)) {
                    # Return the previously-cached file, even if it's older than the cache age limit or not explicitly cacheable.
                    return file_get_contents($cache_filename);
                }
                deal_with_no_internet($redirect, $url);
                return '';
            }
        }
    }
}

/**
 * Grabs an instance of Guzzle pre-configured for our needs and obeying our plugin hooks for custom stream options.
 * @param array $configs
 *
 * @return \GuzzleHttp\Client
 */
function get_guzzle_instance($configs = []) {
    $CI = get_instance();
    $stream_options = [];
    if (method_exists($CI, "dispatch_return")) {
        $stream_options = $CI->dispatch_return('set_stream_options', [], 'array');
    }

    if (!empty($stream_options)) {
        # Process the plugin-changed array.
        $stream_options = array_reset($stream_options);
    }

    if (isset($stream_options["use_streams"])) {
        $handler = new \GuzzleHttp\Handler\StreamHandler();
        $configs["handler"] = \GuzzleHttp\HandlerStack::create($handler);
    }

    if (isset($stream_options["ssl"]["capath"])) {
        $configs["verify"] = $stream_options["ssl"]["capath"];
    }

    if (isset($stream_options["ssl"]["cafile"])) {
        $configs["verify"] = $stream_options["ssl"]["cafile"];
    }

    if (!isset($configs["connect_timeout"])) {
        $configs["connect_timeout"] = 15;
    }

    if (!isset($configs["timeout"])) {
        $configs["timeout"] = 15;
    }

    if (!isset($configs["allow_redirects"])) {
        $configs["allow_redirects"] = ["referer" => true];
    }

    if (!isset($configs["headers"])) {
        $configs["headers"] = [];
    }

    if (!isset($configs["headers"]["User-Agent"])) {
        # This is here to make Google Fonts serve .ttf instead of .woff, which breaks dompdf.
        $configs["headers"]["User-Agent"] = "Mozilla/5.0 (Windows; U; Windows NT 6.1; fr; rv:1.9.1.9) Gecko/20100315 Firefox/3.5.9";
    }

    return new \GuzzleHttp\Client($configs);
}

/**
 * Redirects to the no_internet_access page if $redirect is true (which is only true in PDFs), or if a firewall is blocking external resource access completely.
 * Else, defines TEMPORARY_NO_INTERNET_ACCESS which is used in the admin layout, to show a subtle "no internet access" notification.
 *
 * @param boolean $redirect
 */
function deal_with_no_internet($redirect = false, $url = '') {
    if ($redirect) {
        redirect('no_internet_access/' . base64_encode($url));
    } else {
        defined('TEMPORARY_NO_INTERNET_ACCESS') or define('TEMPORARY_NO_INTERNET_ACCESS', true);
    }
}

function get_email_template($template = null, $field = null) {
    $CI = get_instance();
    $CI->load->model('email_settings_templates');
    return $CI->email_settings_templates->get($template, $field);
}

/**
 * @deprecated  Use \Pancake\Email\Email::send() instead.
 * Sends a Pancake email. Uses the right Pancake theme,
 * fetches template details from the DB, inserts a record of the email
 * in the client's contact log, processes variables, and everything else you need.
 * Available options:
 * REQUIRED to - the email recipient
 * REQUIRED template - the 'identifier' of the desired template in email_settings_templates
 * REQUIRED data - an array of variables to be processed into the template (can contain sub-arrays)
 * REQUIRED client_id - the client's id, for storing email in the contact log
 * OPTIONAL attachments - an array of files in filename => filedata pairs
 * OPTIONAL subject - if provided, will be used instead of the template's default
 * OPTIONAL message - if provided, will be used instead of the template's default
 * OPTIONAL from - if provided, will be used instead of the system's default
 * The following is added to the "data" array automatically:
 * settings -> An array with all settings
 * logo -> The logo's URL
 * user_display_name -> The display name of the current logged in user (or the {settings:admin_name} if not available)
 * client -> The client's record, WITH {client:access_url}
 * @deprecated  Use \Pancake\Email\Email::send() instead.
 *
 * @param array $options
 *
 * @return boolean
 */
function send_pancake_email($options = array()) {
    return \Pancake\Email\Email::send($options);
}

/**
 * @deprecated  Use \Pancake\Email\Email::send_raw() instead.
 * Sends an email as given, without doing any processing.
 * BCCs the email if it's being sent to a client and the BCC setting is turned on.
 * If $from is not provided, the notify_email will be used.
 * @deprecated  Use \Pancake\Email\Email::send_raw() instead.
 *
 * @param string|array $to
 * @param string       $subject
 * @param string       $message
 * @param string       $from
 * @param array        $attachments
 *
 * @return boolean
 */
function send_pancake_email_raw($to, $subject, $message, $from = null, $attachments = array(), $unique_id = '', $item_type = '', $email_config = null) {
    \Pancake\Email\Email::sendRaw($to, $subject, $message, $from, $attachments, $unique_id, $item_type, $email_config);
}

/**
 * Creates a database table.
 *
 * @param $table
 */
function create_table($table) {
    $db = get_instance()->db;
    $table = $db->dbprefix($table);
    $db->query("CREATE TABLE IF NOT EXISTS $table (`id` int(11) unsigned NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}

/**
 * Drops a database table.
 *
 * @param $table
 */
function drop_table($table) {
    $db = get_instance()->db;
    $table = $db->dbprefix($table);
    $db->query("DROP TABLE IF EXISTS $table;");
}

/**
 * Creates a field in $table and a relationship to $rel_table.$rel_field.
 * By default the field is called "id" and the type is "unsigned integer(11)".
 * By default, on updating a record in $rel_table it cascades to $table and on delete it restricts.
 *
 * @param string $table
 * @param string $field
 * @param string $rel_table
 * @param string $rel_field
 * @param string $type
 * @param int    $constraint
 * @param string $on_update
 * @param string $on_delete
 */
function add_relationship_column($original_table, $field, $rel_table, $rel_field = "id", $type = "unsigned_int", $constraint = 11, $on_update = "cascade", $on_delete = "restrict") {
    $db = get_instance()->db;
    $table = $db->dbprefix($original_table);
    $rel_table = $db->dbprefix($rel_table);
    add_column($original_table, $field, $type, $constraint, null, true, '', function () use ($db, $table, $field, $rel_table, $rel_field) {
        $db->query("alter table `$table` add constraint `{$table}_rel_{$field}` foreign key (`$field`) references `$rel_table` (`$rel_field`) on delete restrict on update cascade;");
    });
}

/**
 * Drops a column that has a relationship.
 *
 * @param string $table
 * @param string $field
 */
function drop_relationship_column($table, $name) {
    $db = get_instance()->db;
    $result = $db->query("SHOW COLUMNS FROM " . $db->dbprefix($table) . " LIKE '{$name}'")->row_array();

    if (isset($result['Field']) and $result['Field'] == $name) {
        $db->query("alter table `$table` drop foreign key `{$table}_rel_{$name}`");
        drop_column($table, $name);
    }
}

/**
 * Adds a column to a database table only if that column does not already exist.
 *
 * @param string  $table
 * @param string  $name
 * @param string  $type
 * @param mixed   $constraint
 * @param mixed   $default
 * @param boolean $null
 * @param string  $after_field
 *
 * @return boolean
 */
function add_column($table, $name, $type, $constraint = null, $default = '', $null = false, $after_field = null, $on_after_create = null) {
    $CI = get_instance();
    $CI->load->dbforge();
    $result = $CI->db->query("SHOW COLUMNS FROM " . $CI->db->dbprefix($table) . " LIKE '{$name}'")->row_array();

    if (!isset($result['Field']) or $result['Field'] != $name) {
        $properties = array(
            'type' => $type,
            'null' => $null,
        );

        if ($type == "unsigned_int") {
            $properties["type"] = "INT";
            $properties["unsigned"] = true;
        }

        if ($type == "boolean") {
            $default = $default ? 1 : 0;
        }

        if ($type == "enum" && is_array($constraint)) {
            $constraint = implode(",", array_map(function($value) use ($CI) {
                return $CI->db->escape($value);
            }, $constraint));
        }

        if ($type == "decimal" && is_array($constraint)) {
            $constraint = implode(",", array_map(function($value) use ($CI) {
                return $CI->db->escape($value);
            }, $constraint));
        }

        if ($null === FALSE and $default !== null) {
            $properties['default'] = $default;
        }

        if ($constraint !== NULL) {
            $properties['constraint'] = $constraint;
        }

        if (empty($after_field)) {
            $after_field = null;
        }

        $CI->dbforge->add_column($table, array($name => $properties), $after_field);
        if (is_callable($on_after_create)) {
            call_user_func($on_after_create);
        }
    }
}

/**
 * Drops a table's column.
 *
 * @param string $table
 * @param string $name
 *
 * @return mixed
 */
function drop_column($table, $name) {
    $CI = &get_instance();
    $result = $CI->db->query("SHOW COLUMNS FROM " . $CI->db->dbprefix($table) . " LIKE '{$name}'")->row_array();

    if (isset($result['Field']) and $result['Field'] == $name) {
        return $CI->dbforge->drop_column($table, $name);
    }
}

function get_count($type, $client_id = 0) {

    static $counts = array(
        'paid' => array(),
        'overdue' => array(),
        'sent_but_unpaid' => array(),
        'unsent' => array(),
        'recurring' => array(),
        'estimates' => array(),
        'accepted' => array(),
        'rejected' => array(),
        'unanswered' => array(),
        'credit_notes' => array(),
        'all' => array(),
        'proposals' => array(),
        'proposals_accepted' => array(),
        'proposals_rejected' => array(),
        'proposals_unanswered' => array(),
        'proposals_archived' => array(),
        'task_comments' => array(),
        'project_comments' => array(),
        'estimates_unsent' => array(),
        'estimates_archived' => array(),
        'invoices_archived' => array(),
    );

    $client_id = (int) $client_id;

    if (isset($counts[$type][$client_id])) {
        return $counts[$type][$client_id];
    }

    $CI = &get_instance();
    $CI->load->model('invoices/invoice_m');
    $CI->load->model('projects/project_task_m');
    $CI->load->model('projects/project_m');

    switch ($type) {
        case 'all':
            $counts[$type][$client_id] = get_count('unpaid', $client_id) + get_count('paid', $client_id);
            break;
        case 'proposals':
        case 'proposals_accepted':
        case 'proposals_rejected':
        case 'proposals_unanswered':
        case 'proposals_archived':
            $CI->load->model('proposals/proposals_m');
            $client_id = ($client_id == 0) ? null : $client_id;

            if ($client_id !== null) {
                $where = array('client_id' => $client_id);
            } else {
                $where = array();
            }

            if ($type == "proposals") {
                $where['is_archived'] = 0;
            } elseif ($type == "proposals_archived") {
                $where['is_archived'] = 1;
            } else {
                # Remove "proposals_" from the type to find the desired status.
                $status = strtoupper(substr($type, strlen('proposals_')));
                $status = $status == "UNANSWERED" ? "" : $status;
                $where['status'] = $status;
                $where['is_archived'] = 0;
            }

            $counts[$type][$client_id] = $CI->proposals_m->count($where);
            break;
        case 'estimates':
            $counts[$type][$client_id] = $CI->invoice_m->countEstimates($client_id);
            break;
        case 'accepted':
            $counts[$type][$client_id] = $CI->invoice_m->countEstimates($client_id, 'ACCEPTED');
            break;
        case 'rejected':
            $counts[$type][$client_id] = $CI->invoice_m->countEstimates($client_id, 'REJECTED');
            break;
        case 'unanswered':
            $counts[$type][$client_id] = $CI->invoice_m->countEstimates($client_id, '');
            break;
        case 'estimates_unsent':
            $counts[$type][$client_id] = $CI->invoice_m->countEstimates($client_id, null, false);
            break;
        case 'estimates_archived':
            $counts[$type][$client_id] = $CI->invoice_m->countEstimates($client_id, null, null, true);
            break;
        case 'credit_notes':
            $counts[$type][$client_id] = $CI->invoice_m->count_credit_notes($client_id, false);
            break;
        case 'credit_notes_archived':
            $counts[$type][$client_id] = $CI->invoice_m->count_credit_notes($client_id, true);
            break;
        case 'paid':
            $counts[$type][$client_id] = $CI->invoice_m->count_paid($client_id == 0 ? null : $client_id);
            break;
        case 'overdue':
            $counts[$type][$client_id] = $CI->invoice_m->count_overdue($client_id == 0 ? null : $client_id);
            break;
        case 'sent_but_unpaid':
            $counts[$type][$client_id] = $CI->invoice_m->count_sent_but_unpaid($client_id == 0 ? null : $client_id);
            break;
        case 'unpaid':
            $counts[$type][$client_id] = $CI->invoice_m->count_unpaid($client_id == 0 ? null : $client_id);
            break;
        case 'unsent':
            $counts[$type][$client_id] = $CI->invoice_m->count_unsent($client_id == 0 ? null : $client_id);
            break;
        case 'unsent_recurrences':
            $counts[$type][$client_id] = $CI->invoice_m->count_unsent_recurrences($client_id == 0 ? null : $client_id);
            break;
        case 'unsent_not_recurrences':
            $counts[$type][$client_id] = $CI->invoice_m->count_unsent_not_recurrences($client_id == 0 ? null : $client_id);
            break;
        case 'unpaid_recurrences':
            $counts[$type][$client_id] = $CI->invoice_m->count_unpaid_recurrences($client_id == 0 ? null : $client_id);
            break;
        case 'unpaid_not_recurrences':
            $counts[$type][$client_id] = $CI->invoice_m->count_unpaid_not_recurrences($client_id == 0 ? null : $client_id);
            break;
        case 'invoices_archived':
            $counts[$type][$client_id] = $CI->invoice_m->count_archived($client_id == 0 ? null : $client_id);
            break;
        case 'recurring':
            $counts[$type][$client_id] = $CI->invoice_m->count_recurring($client_id == 0 ? null : $client_id);
            break;
        case 'task_comments':
            # In this case, $client_id is actually a task ID.
            $counts[$type][$client_id] = $CI->project_task_m->get_comment_count($client_id);
            break;
        case 'project_comments':
            # In this case, $client_id is actually a project ID.
            $counts[$type][$client_id] = $CI->project_m->get_comment_count($client_id);
            break;
    }

    return $counts[$type][$client_id];
}

function pancake_upload($input, $unique_id_or_comment_id, $type = 'invoice', $client_id = 0, $verify_only = false) {
    if (is_array($input)) {
        # This handles an error where $input could be [null], meaning it has a key/value pair but should really just be considered empty.
        $is_empty = empty(array_filter($input, function ($value) {
            return !empty($value);
        }));
    } else {
        $is_empty = empty($input);
    }

    if ($is_empty) {
        # Attempt nothing; there were no valid files provided.
        return [];
    }

    if (!is_array($input) && $input instanceof \Symfony\Component\HttpFoundation\File\UploadedFile) {
        $input = [$input];
    }

    $allowed_extensions = array_map(function ($value) {
        return strtolower(trim($value));
    }, explode(',', Settings::get('allowed_extensions')));

    if (isset($input["name"]) && isset($input["tmp_name"]) && isset($input["error"])) {
        $input = new \Symfony\Component\HttpFoundation\FileBag(["files" => $input]);
        $input = $input->get("files");
        if (!is_array($input)) {
            $input = [$input];
        }

        /** @var \Symfony\Component\HttpFoundation\File\UploadedFile[] $input */
        $errors = [];
        foreach ($input as $key => $file) {
            if (!($file instanceof \Symfony\Component\HttpFoundation\File\UploadedFile)) {
                unset($input[$key]);
                continue;
            }

            # Validate upload errors.
            if ($file->getError() !== UPLOAD_ERR_OK) {
                $errors[$file->getClientOriginalName()] = $file->getError();
            }

            # Validate extension disallowed errors.
            $ext = strtolower($file->getClientOriginalExtension());
            if (!in_array($ext, $allowed_extensions)) {
                $errors[$file->getClientOriginalName()] = \Pancake\Filesystem\Filesystem::UPLOAD_ERROR_EXTENSION;
            }
        }
    } elseif (is_string(array_reset($input))) {
        # Validate extension disallowed errors.
        foreach (array_keys($input) as $filename) {
            $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
            if (!in_array($ext, $allowed_extensions)) {
                $errors[$filename] = \Pancake\Filesystem\Filesystem::UPLOAD_ERROR_EXTENSION;
            }
        }
    } elseif (array_reset($input) instanceof \Symfony\Component\HttpFoundation\File\UploadedFile) {
        # Validate extension disallowed errors.
        foreach ($input as $file) {
            /* @var \Symfony\Component\HttpFoundation\File\UploadedFile $file */
            $ext = strtolower($file->getClientOriginalExtension());
            if (!in_array($ext, $allowed_extensions)) {
                $errors[$file->getClientOriginalName()] = \Pancake\Filesystem\Filesystem::UPLOAD_ERROR_EXTENSION;
            }
        }
    } else {
        throw new RuntimeException("Uploaded File is not a form-based input and is not an array of either filenames or UploadedFile instances.");
    }

    if (!empty($errors)) {
        throw new \Pancake\Filesystem\UploadException($errors);
    }

    switch ($type) {
        case 'invoice':
        case 'invoices':
            $folder_name = sha1(time() . $unique_id_or_comment_id) . '/';
            break;
        case 'tickets':
            $folder_name = 'tickets/' . sha1(time()) . '/';
            break;
        case 'expenses':
            $folder_name = 'expenses/' . sha1(time()) . '/';
            break;
        case 'client':
            $folder_name = 'clients/' . $client_id . '-' . sha1(time()) . '/';
            break;
        case 'redactor':
            $folder_name = 'redactor/';
            break;
        default:
            $folder_name = 'branding/';
            break;
    }

    $return = array();

    foreach ($input as $key => $file) {
        if ($file instanceof \Symfony\Component\HttpFoundation\File\UploadedFile) {
            $ext = $file->getClientOriginalExtension();
            $basename = $file->getClientOriginalName();
            $resource = fopen($file->getRealPath(), 'r');
        } else {
            $basename = $key;
            $ext = strtolower(pathinfo($basename, PATHINFO_EXTENSION));
            $resource = $file;
        }

        switch ($type) {
            case 'redactor':
                $real_name = sha1(time()) . "." . strtolower($ext);
                break;
            default:
                $real_name = $basename;
                break;
        }

        $buffer = array(
            'real_name' => $real_name,
            'folder_name' => $folder_name,
            'url' => Pancake\Filesystem\Filesystem::url($folder_name . $real_name),
        );

        if (!$verify_only) {
            if ($file instanceof \Symfony\Component\HttpFoundation\File\UploadedFile) {
                \Pancake\Filesystem\Filesystem::writeStream($folder_name . $real_name, $resource);
            } else {
                \Pancake\Filesystem\Filesystem::write($folder_name . $real_name, $resource);
            }
        }

        $return[$real_name] = $buffer;
    }

    return $return;
}

function time_to_decimal($hours_minutes) {
    $hours_minutes = explode(':', $hours_minutes);
    if (count($hours_minutes) == 1) {
        # It's just decimal for hours.
        return process_number($hours_minutes[0]);
    } elseif (count($hours_minutes) == 2) {
        # It's hh:mm. 15:30 => 15 + 30/60 => 15.5
        $hours_minutes[0] = floatval(empty($hours_minutes[0]) ? "0" : $hours_minutes[0]);
        $hours_minutes[1] = floatval(empty($hours_minutes[1]) ? "0" : $hours_minutes[1]);

        return $hours_minutes[0] + ($hours_minutes[1] / 60);
    } elseif (count($hours_minutes) == 3) {
        # It's hh:mm:ss. 15:30:15 => 15 + 30/60 + 15/3600
        $hours_minutes[0] = floatval(empty($hours_minutes[0]) ? "0" : $hours_minutes[0]);
        $hours_minutes[1] = floatval(empty($hours_minutes[1]) ? "0" : $hours_minutes[1]);
        $hours_minutes[2] = floatval(empty($hours_minutes[2]) ? "0" : $hours_minutes[2]);

        return $hours_minutes[0] + ($hours_minutes[1] / 60) + ($hours_minutes[2] / 3600);
    } else {
        # It's invalid.
        return 0;
    }
}

/**
 * Transforms the assigned_user_id to the right ID if it's 0 and there's only one user.
 *
 * @param int $assigned_user_id
 *
 * @return int
 */
function fix_assigned($assigned_user_id) {

    $CI = &get_instance();
    $CI->load->model('users/user_m');

    static $user_id = null;

    if ($user_id === null) {
        $users = $CI->user_m->get_users_list();
        $users = array_keys($users);
        $user_id = reset($users);
    }

    if ($CI->user_m->count_all() == 1) {
        return $user_id;
    } else {
        return $assigned_user_id;
    }
}

function get_pdf($type, $unique_id, $return_html = false, $stream = false) {
    $CI = &get_instance();
    $original_layout = $CI->template->_layout;
    unset($CI->template->_partials['notifications']);
    unset($CI->template->_partials['search']);
    $CI->template->_module = 'frontend';
    require_once APPPATH . 'modules/gateways/gateway.php';
    $CI->load->helper('typography');
    $CI->load->model('proposals/proposals_m');
    $CI->load->model('invoices/invoice_m');
    $CI->load->model('files/files_m');
    $CI->load->model('clients/clients_m');

    $CI->template->pdf_mode = true;
    switch_theme(false);

    if ($type == 'invoice') {

        $invoice = $CI->invoice_m->get($unique_id);
        $client = $CI->clients_m->get($invoice['client_id']);
        Business::setBusinessFromClient($invoice['client_id']);

        $data_array = array(
            'site_name' => preg_replace('/[^A-Za-z0-9-]/', '', str_ireplace(' ', '-', strtolower(Business::getBrandName()))),
            'number' => $invoice['invoice_number'],
            'id' => $invoice['id'],
            'type' => $invoice['type'] == 'DETAILED' ? 'invoice' : strtolower($invoice['type']),
            'client' => (array) $client,
            'date_of_creation' => $invoice['date_entered'],
        );
        $filename = $CI->dispatch_return('pdf_filename_generated', $data_array);

        if (is_array($filename) or empty($filename)) {
            // Plugin is not installed; use old format:
            $filename = "{$data_array['site_name']}-{$data_array['type']}-{$data_array['number']}.pdf";
        }

        switch_language($invoice['language']);

        $CI->template->is_paid = $CI->invoice_m->is_paid($unique_id);
        $CI->template->files = (array) $CI->files_m->get_by_unique_id($unique_id);
        $CI->template->invoice = (array) $invoice;
        $CI->template->type = $invoice['type'];

        $CI->template->set_layout('detailed');
        $html = $CI->template->build('detailed', array(), true);
    } elseif ($type == 'proposal') {
        $proposal = (array) $CI->proposals_m->getByUniqueId($unique_id, true);
        $proposal['client'] = (array) $proposal['client'];
        Business::setBusinessFromClient($proposal['client']['id']);

        switch_language($proposal['client']['language']);

        $data_array = array(
            'site_name' => preg_replace('/[^A-Za-z0-9-]/', '', str_ireplace(' ', '-', strtolower(Business::getBrandName()))),
            'type' => 'proposal',
            'number' => $proposal['proposal_number'],
            'id' => $proposal['id'],
            'client' => $proposal['client'],
            'date_of_creation' => $proposal['created'],
        );
        $filename = $CI->dispatch_return('pdf_filename_generated', $data_array);

        if (is_array($filename) or empty($filename)) {
            // Plugin is not installed; use old format:
            $filename = "{$data_array['site_name']}-{$data_array['type']}-{$data_array['number']}.pdf";
        }

        $CI->template->new = (bool) $proposal;
        $result = $CI->db->get('clients')->result_array();
        $clients = array();
        foreach ($result as $row) {
            $row['title'] = $row['first_name'] . ' ' . $row['last_name'] . ($row['company'] ? ' - ' . $row['company'] : '');
            $clients[] = $row;
        }
        $CI->template->clients = $clients;
        $CI->template->proposal = $proposal;
        $CI->template->set_layout('proposal');
        $html = $CI->template->build('proposal', array(), true);
    }

    # Fix dompdf rendering issues.
    # This is here and not in get_pdf_raw() so that you can see the manipulations with /die.
    $html = str_ireplace('border-style: initial;', 'border-style: inherit;', $html);
    $html = str_ireplace('border-color: initial;', 'border-color: inherit;', $html);
    $html = preg_replace_callback("/(<p(?:\\s*style=\"text-align: center;\"\\s*)?>)\\s*(<img[^>]*(display:\\s*block;?)[^>]*>)\\s*(<\/p>)?/i", function ($matches) {
        return '<p style="text-align: center;">' . str_ireplace($matches[3], "", $matches[2]) . '</p>';
    }, $html);
    $html = preg_replace_callback("/(<p(?:\\s*style=\"text-align: center;\"\\s*)?>)\\s*(<img[^>]*(margin:\\s*auto;?)[^>]*>)\\s*(<\/p>)?/i", function ($matches) {
        return '<p style="text-align: center;">' . str_ireplace($matches[3], "", $matches[2]) . '</p>';
    }, $html);

    /* Convert all <img> src's into data URIs to prevent loopback connection problems. */
    $matches = array();
    get_instance()->load->helper("file");
    # This part of the regex is for detecting version strings like ?41223.
    # It's designed to skip situations where the URL is like ?/files/fetch.
    $version_regex = "(?:\\?[0-9a-z\\.]+)?";
    if (preg_match_all("/<img[^>]+src=['\"]([^'\"]+?){$version_regex}['\"][^>]+>/u", $html, $matches) > 0) {
        foreach ($matches[1] as $image) {
            $suffix = "/fetch";
            if (substr($image, -strlen($suffix)) == $suffix) {
                $image_without_fetch = substr($image, 0, -strlen($suffix));
                $mime = get_mime_by_extension(array_end(explode("/", $image_without_fetch)));
            } else {
                $mime = get_mime_by_extension(array_end(explode("/", $image)));
            }
            $data_uri = 'data:' . $mime . ';base64,' . base64_encode(get_url_contents($image));
            $html = str_replace($image, $data_uri, $html);
        }
    }

    $cjk_regex = '/(\\p{Han}+|\\p{Bopomofo}+|\\p{Hiragana}+|\\p{Katakana}+)/um';
    if (preg_match($cjk_regex, $html)) {
        $html = preg_replace($cjk_regex, '<span class="cjk">$1</span>', $html);

        $html = str_ireplace("</head>", "<style>
                @font-face {
                    font-family: 'pancake-cjk-font';
                    font-style: normal;
                    font-weight: 400;
                    src: url('https://i.28hours.org/files/pancake-cjk-font.ttf') format('truetype');
                }

                .pdf .cjk {
                    font-family: 'pancake-cjk-font', sans-serif !important;
                }
            </style>", $html);
    }

    if (!$return_html) {
        $data_array = array(
            "type" => $data_array['type'],
            "id" => $data_array['id'],
            "date_of_creation" => $data_array['date_of_creation'],
            "paper_size" => Settings::get('pdf_page_size'),
            "orientation" => "portrait",
        );
        $pdf_details = $CI->dispatch_return('decide_pdf_size_and_orientation', $data_array, 'array');

        # Deal with the modification of the array by dispatch_return().
        if (isset($pdf_details[0])) {
            $pdf_details = array_reset($pdf_details);
        }

        $pdf = get_pdf_raw($filename, $html, $stream, $pdf_details["paper_size"], $pdf_details["orientation"]);
    }

    switch_theme(true);
    $CI->template->set_layout($original_layout);
    $CI->template->set_partial('notifications', 'partials/notifications');
    $CI->template->set_partial('search', 'partials/search');

    if ($return_html) {
        return $html;
    } else {
        return array(
            'contents' => $pdf,
            'invoice' => ($type == 'invoice' ? $invoice : $proposal),
            'filename' => $filename,
        );
    }
}

function get_pdf_raw($filename, $html, $stream = false, $paper_size = null, $orientation = 'portrait') {

    if ($paper_size === null) {
        $paper_size = Settings::get('pdf_page_size');
    }

    if (empty($filename)) {
        $filename = 'file.pdf';
    }

    $dompdf_html_to_pdf = function ($html) use ($paper_size, $orientation) {
        if (!is_dir(PANCAKE_TEMP_DIR . 'dompdf')) {
            mkdir(PANCAKE_TEMP_DIR . 'dompdf', 0777, true);
        }

        $dompdf = new \Dompdf\Dompdf([
            "tempDir" => PANCAKE_TEMP_DIR . "dompdf",
            "fontCache" => PANCAKE_TEMP_DIR . "dompdf",
            "fontDir" => PANCAKE_TEMP_DIR . "dompdf",
            "logOutputFile" => PANCAKE_TEMP_DIR . "dompdf" . DIRECTORY_SEPARATOR . "log.htm",
            "isRemoteEnabled" => true,
            "isHtml5ParserEnabled" => false,
            "isFontSubsettingEnabled" => true,
            "isPhpEnabled" => true,
        ]);

        $html = str_ireplace('{{page}}', '<span class="current-page"></span>', $html);
        $html = str_ireplace('</body>', '<script type="text/php">
  $pdf->page_script(\'
        foreach ($pdf->get_cpdf()->objects as &$object) {
            if (array_key_exists("c", $object)) {
                $pages_with_null_characters = implode(chr(0), str_split("{{pages}}"));
                if (strpos($object["c"], "{{pages}}") !== false) {
                    $object["c"] = str_replace("{{pages}}", $pdf->get_page_count(), $object["c"]);
                } elseif (strpos($object["c"], $pages_with_null_characters) !== false) {
                    $object["c"] = str_replace($pages_with_null_characters, $pdf->get_page_count(), $object["c"]);
                }
            }
        }
  \');
  </script></body>', $html);
        $html = preg_replace('/>\s+</', '><', $html);

        #echo $html;die;

        #$html = file_get_contents("/Users/bruno/Desktop/adv-csspagecount.html");

        $dompdf->setPaper($paper_size, $orientation);
        $dompdf->loadHtml($html);
        if (IS_DEBUGGING) {
            $dompdf->render();
        } else {
            # Always silence dompdf warnings because they're small notices all the time.
            # There's no point in hearing about these warnings because there's not much we can do, and they don't affect normal usage.
            @$dompdf->render();
        }
        return $dompdf->output();
    };

    # Loading stuff when the protocol is not specified leads to an error.
    # It also prevents dompdf from loading it.
    $html = preg_replace("/href=(['\"])\/\//ui", "href=$1http://", $html);
    $html = preg_replace("/url\((['\"]?)\/\//ui", "url($1http://", $html);

    # background-color: initial breaks PDFs.
    $html = str_ireplace("background-color: initial;", "", $html);

    $full_pdf_path = "pdfs/" . $filename . "/" . md5($html . $paper_size) . ".pdf";

    if (\Pancake\Filesystem\Filesystem::has($full_pdf_path) && !IS_DEBUGGING) {
        $pdf_contents = \Pancake\Filesystem\Filesystem::read($full_pdf_path);
    } else {
        $html_to_pdf_library = Settings::get("html_to_pdf_library") ?: "dompdf";

        if (Events::has_listeners('generate_pdf')) {
            $pdf_contents = get_instance()->dispatch_return('generate_pdf', array(
                'html' => $html,
                'paper_size' => $paper_size,
                'orientation' => $orientation,
            ));

            if (is_array($pdf_contents)) {
                # We didn't get a valid PDF, let's fall back on dompdf.
                $pdf_contents = $dompdf_html_to_pdf($html);
            }
        } elseif ($html_to_pdf_library == "wkhtmltopdf") {
            $temp_dir = PANCAKE_TEMP_DIR;
            $temp_pdf_filename = $temp_dir . uniqid() . ".pdf";
            $temp_html_filename = $temp_dir . uniqid() . ".html";
            file_put_contents($temp_html_filename, $html);

            $output = array();
            $return_code = 0;

            $command = "/usr/local/bin/wkhtmltopdf --print-media-type " . escapeshellarg($temp_html_filename) . " " . escapeshellarg($temp_pdf_filename) . " 2>&1";
            $result = exec($command, $output, $return_code);

            if (file_exists($temp_pdf_filename)) {
                $pdf_contents = file_get_contents($temp_pdf_filename);
                unlink($temp_pdf_filename);
            }

            if (file_exists($temp_html_filename)) {
                unlink($temp_html_filename);
            }

            if ($return_code !== 0) {
                # Failed to generate using wkhtmltopdf, try using dompdf instead.

                # Code 127 is "no such file or directory".
                if (IS_DEBUGGING && $return_code !== 127) {
                    debug($temp_dir, $command, $output, $return_code);
                }

                $pdf_contents = $dompdf_html_to_pdf($html);
            }
        } else {
            $pdf_contents = $dompdf_html_to_pdf($html);
        }

        # Try to cache this PDF.
        # If it fails, it'll just generate one again (as has been the case from 1.0.0 to 4.0.3); it doesn't affect Pancake's functionality.
        # Hence why we don't even care about checking if it succeeded.
        try {
            # We silence warnings to avoid 'permission denied' errors popping up in this situation.
            @\Pancake\Filesystem\Filesystem::write($full_pdf_path, $pdf_contents);
        } catch (Exception $e) {
            // Ignore.
        }
    }

    if ($stream) {
        header("Cache-Control: private");
        header("Content-type: application/pdf");
        header("Content-Length: " . mb_strlen($pdf_contents, "8bit"));
        header("Content-Disposition: inline; filename=\"$filename\"");
        echo $pdf_contents;
        flush();
    } else {
        return $pdf_contents;
    }
}

/**
 * Get either a Gravatar URL or complete image tag for a specified email address.
 *
 * @param string $email The email address
 * @param string $s     Size in pixels, defaults to 80px [ 1 - 2048 ]
 * @param string $d     Default imageset to use [ 404 | mm | identicon | monsterid | wavatar ]
 * @param string $r     Maximum rating (inclusive) [ g | pg | r | x ]
 * @param boole  $img   True to return a complete IMG tag False for just the URL
 * @param array  $atts  Optional, additional key/value attributes to include in the IMG tag
 *
 * @return String containing either just a URL or a complete image tag
 * @source http://gravatar.com/site/implement/images/php/
 */
function get_gravatar($email, $s = 80, $d = 'mm', $r = 'g', $img = false, $atts = array()) {
    $url = IS_SSL ? 'https://secure.' : 'http://www.';
    $url .= 'gravatar.com/avatar/';
    $url .= md5(strtolower(trim($email)));
    $url .= "?s=$s&d=$d&r=$r";
    if ($img) {
        $url = '<img src="' . $url . '"';
        foreach ($atts as $key => $val) {
            $url .= ' ' . $key . '="' . $val . '"';
        }
        $url .= ' />';
    }
    return $url;
}

function get_timer_attrs($timers, $task_id) {
    if (isset($timers[$task_id])) {
        $task = $timers[$task_id];
    } else {
        $task = array(
            'id' => 0,
            'is_paused' => 0,
            'current_seconds' => 0,
            'last_modified_timestamp' => 0,
        );
    }

    return array(
        "task-id" => $task_id,
        "is-paused" => $task['is_paused'],
        "current-seconds" => $task['current_seconds'],
        "last-modified-timestamp" => $task['last_modified_timestamp'],
        "start" => __('global:start_timer'),
        "stop" => __('global:stop_timer'),
    );
}

function build_data_attrs($attrs) {
    $html = array();
    foreach ($attrs as $attr_name => $attr_value) {
        if (!preg_match("/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/u", $attr_name)) {
            throw new Exception("You cannot use the attribute 'data-$attr_name'.");
        }

        $attr_value = str_ireplace('"', "'", $attr_value);
        $html[] = "data-" . $attr_name . '="' . $attr_value . '"';
    }

    return implode(" ", $html);
}

function timer($timers, $task_id) {
    echo build_data_attrs(get_timer_attrs($timers, $task_id));
}

/**
 * Convert hour format to decimal.
 * If it's already decimal, it doesn't change the value.
 * eg. 00:30 returns 0.5 and 0.5 returns 0.5.
 *
 * @param string $value
 *
 * @return string
 */
function process_hours($value) {

    if (empty($value)) {
        $value = "0";
    }

    if (stristr($value, ':') === false) {
        // Decimal.

        if ($value[0] == ".") {
            // It's a decimal that doesn't have a 0 at the start (e.g. ".25"). Add the zero.
            $value = "0" . $value;
        }

        $regex = "/([0-9]+(?:\.[0-9]+)?)/";
        $matches = array();
        $result = preg_match($regex, $value, $matches);
        if ($result === 1) {
            $value = (float) $matches[1];
        } else {
            $value = 0;
        }
    } else {
        return time_to_decimal($value);
    }

    return $value;
}

function protocol() {
    return 'http' . (IS_SSL ? 's' : '') . '://';
}

function switch_language($new_language) {
    return get_instance()->lang->switch_language($new_language);
}

function invoice_item_type_id($item) {
    if (!isset($item['item_type_table'])) {
        return '';
    }

    switch ($item['item_type_table']) {
        case 'project_expenses':
            return "EXPENSE_" . $item['item_type_id'];
            break;
        case 'project_tasks':
            if (stristr($item['item_type_id'], "FLATTASK") == false) {
                if ($item['type'] == "flat_rate") {
                    return "FLATTASK_" . $item['item_type_id'];
                } else {
                    return "TASK_" . $item['item_type_id'];
                }
            } else {
                return $item['item_type_id'];
            }
            break;
        case 'project_milestones':
            return "MILESTONE_" . $item['item_type_id'];
            break;
        default:
            return '';
    }
}

function build_invoice_item_id_link($invoice_item_id) {
    $CI = get_instance();
    $CI->load->model('invoices/invoice_m');
    $invoice = $CI->invoice_m->getByRowId($invoice_item_id);
    if (isset($invoice['unique_id'])) {
        return anchor($invoice['unique_id'], "#" . $invoice['invoice_number']);
    } else {
        return "[Invoice No Longer Exists]";
    }
}

function invoice_item_type($item) {

    if ($item['type'] == 'support_ticket') {
        return "Support Ticket";
    }

    if ($item['item_type_id'] == 0) {
        return __('items:select_standard');
    }

    $tables = array(
        '' => __('items:select_standard'),
        'project_expenses' => __('items:select_expense'),
        'project_tasks' => __('global:task'),
        'project_milestones' => __('milestones:milestone'),
    );
    return isset($tables[$item['item_type_table']]) ? $tables[$item['item_type_table']] : __('items:select_standard');
}

/**
 * Generate an Invoice for a billable ticket
 *
 * @param int   $ticket_id
 * @param int   $client_id
 * @param float $amount
 */
function generate_ticket_invoice($ticket_id, $client_id, $priority_id) {
    $due_date = Settings::get('default_invoice_due_date') > 0 ? strtotime("+" . Settings::get('default_invoice_due_date') . " days") : '';
    $CI = &get_instance();

    $CI->load->model('invoices/invoice_m');
    $CI->load->model('clients/client_support_rates_matrix_m');

    $support_rate = $CI->client_support_rates_matrix_m->getByClientIdAndPriorityId($client_id, $priority_id);
    $amount = $support_rate['rate'];

    $ticket = $CI->ticket_m->get_by("id", $ticket_id);
    $CI->ticket_m->get_latest_post($ticket);

    $invoice_data = array(
        'unique_id' => $CI->invoice_m->_generate_unique_id(),
        'client_id' => $client_id,
        'project_id' => '',
        'type' => 'DETAILED',
        'invoice_number' => $CI->invoice_m->_generate_invoice_number(null, 'DETAILED', null, $client_id),
        'is_viewable' => '1',
        'is_recurring' => '0',
        'frequency' => 'm',
        'auto_send' => '1',
        'send_x_days_before' => Settings::get('send_x_days_before'),
        'due_date' => $due_date,
        'currency' => '0',
        'description' => '',
        'invoice_item' =>
            array(
                'name' =>
                    array(
                        0 => __("tickets:invoice_for_ticket", array($ticket_id, $ticket->subject)),
                    ),
                'qty' =>
                    array(
                        0 => '1',
                    ),
                'rate' =>
                    array(
                        0 => $amount,
                    ),
                'tax_id' =>
                    array(
                        0 => '',
                    ),
                'item_time_entries' =>
                    array(
                        0 => '',
                    ),
                'item_type_id' =>
                    array(
                        0 => '',
                    ),
                'type' =>
                    array(
                        0 => 'support_ticket',
                    ),
                'total' =>
                    array(
                        0 => $amount,
                    ),
                'description' =>
                    array(
                        0 => $ticket->latest_post->message,
                    ),
            ),
        'notes' => __("tickets:link_to_ticket", site_url()),
        'amount' => $amount,
        'partial-amount' =>
            array(
                1 => '100',
            ),
        'partial-is_percentage' =>
            array(
                1 => '1',
            ),
        'partial-notes' =>
            array(
                1 => '',
            ),
        'date_entered' => time(),
        'partial-due_date' =>
            array(
                1 => $due_date,
            ),
    );

    $result = $CI->invoice_m->insert($invoice_data);

    if ($result) {
        return array("id" => $CI->invoice_m->getIdByUniqueId($result), "uid" => $result);
    }

    return false;
}

/**
 * Get Client support rate data
 */
function get_client_support_matrix($client_id) {
    $CI = &get_instance();

    $CI->load->model('tickets/ticket_priorities_m', 'priorities');

    $CI->load->model('clients/client_support_rates_matrix_m', 'csrm');

    $ticket_priorities = $CI->priorities->get_all();
    $_client_ticket_priorities = $CI->csrm->byClientId($client_id);

    if ($_client_ticket_priorities) {
        foreach ($_client_ticket_priorities as $k => $cpriority) {
            foreach ($ticket_priorities as $k2 => &$tpriority) {
                if ($cpriority->priority_id == $tpriority->id) {
                    $tpriority->default_rate = $cpriority->rate;
                }
            }
        }
    }

    return $data = array('ticket_priorities' => $ticket_priorities, 'client_id' => $client_id, 'client_has_rates' => true);
}

function get_between($content, $start, $end) {
    $r = explode($start, $content);
    if (isset($r[1])) {
        $r = explode($end, $r[1]);
        return $r[0];
    }
    return '';
}

function getTextColor($hexcolor) {
    $r = hexdec(substr($hexcolor, 0, 2));
    $g = hexdec(substr($hexcolor, 2, 2));
    $b = hexdec(substr($hexcolor, 4, 2));
    $yiq = (($r * 299) + ($g * 587) + ($b * 114)) / 1000;
    return ($yiq >= 128) ? 'black' : 'white';
}

function get_dropdown($table, $id_field, $value_field, $primary_or_where = null) {
    $db = get_instance()->db;

    if (!empty($primary_or_where)) {
        if (is_array($primary_or_where)) {
            foreach ($primary_or_where as $field => $value) {
                if (is_array($value)) {
                    $db->where_in($field, $value);
                } else {
                    $db->where($field, $value);
                }
            }
        } else {
            $db->where(array($table . '.' . $id_field => $primary_or_where));
        }
    }

    $results = $db->get($table)->result_array();
    $return = array();
    foreach ($results as $row) {
        if (is_callable($value_field)) {
            $return[$row[$id_field]] = call_user_func($value_field, $row);
        } else {
            $return[$row[$id_field]] = $row[$value_field];
        }
    }

    return $return;
}

if (!function_exists('function_usable')) {

    /**
     * Function usable
     * Executes a function_exists() check, and if the Suhosin PHP
     * extension is loaded - checks whether the function that is
     * checked might be disabled in there as well.
     * This is useful as function_exists() will return FALSE for
     * functions disabled via the *disable_functions* php.ini
     * setting, but not for *suhosin.executor.func.blacklist* and
     * *suhosin.executor.disable_eval*. These settings will just
     * terminate script execution if a disabled function is executed.
     * The above described behavior turned out to be a bug in Suhosin,
     * but even though a fix was commited for 0.9.34 on 2012-02-12,
     * that version is yet to be released. This function will therefore
     * be just temporary, but would probably be kept for a few years.
     *
     * @link    http://www.hardened-php.net/suhosin/
     *
     * @param    string $function_name Function to check for
     *
     * @return    bool    TRUE if the function exists and is safe to call,
     *            FALSE otherwise.
     */
    function function_usable($function_name) {
        static $_suhosin_func_blacklist;

        if (function_exists($function_name)) {
            if (!isset($_suhosin_func_blacklist)) {
                if (extension_loaded('suhosin')) {
                    $_suhosin_func_blacklist = explode(',', trim(ini_get('suhosin.executor.func.blacklist')));

                    if (!in_array('eval', $_suhosin_func_blacklist, true) && ini_get('suhosin.executor.disable_eval')) {
                        $_suhosin_func_blacklist[] = 'eval';
                    }
                } else {
                    $_suhosin_func_blacklist = array();
                }
            }

            return !in_array($function_name, $_suhosin_func_blacklist, true);
        }

        return false;
    }

}

if (!function_exists('get_mimes')) {

    /**
     * Returns the MIME types array from config/mimes.php
     *
     * @return    array
     */
    function &get_mimes() {
        static $_mimes = array();

        if (file_exists(APPPATH . 'config/' . ENVIRONMENT . '/mimes.php')) {
            $_mimes = include(APPPATH . 'config/' . ENVIRONMENT . '/mimes.php');
        } elseif (file_exists(APPPATH . 'config/mimes.php')) {
            $_mimes = include(APPPATH . 'config/mimes.php');
        }

        return $_mimes;
    }

}

function client_name($client_id) {
    static $clients_m;

    if (is_array($client_id)) {
        $client_id = $client_id["id"];
    }

    if (is_object($client_id)) {
        $client_id = $client_id->id;
    }

    if ($clients_m === null) {
        $CI = get_instance();
        $CI->load->model("clients/clients_m");
        $clients_m = $CI->clients_m;
    }

    return $clients_m->get_human_value($client_id);
}

/**
 * Switches between the admin theme and the frontend theme.
 * This function is recommended for switching themes because it resolves an issue
 * that would cause Pancake not to work properly if a theme folder was deleted.
 *
 * @param boolean $admin
 */
function switch_theme($admin = true) {
    if ($admin) {
        $admin_prefix = 'admin/';
        $theme = PAN::setting('admin_theme');
    } else {
        $admin_prefix = '';
        $theme = PAN::setting('theme');
    }

    if (!file_exists(FCPATH . "third_party/themes/" . $admin_prefix . $theme)) {
        $theme = "pancake";
        # Reset the theme setting, because the theme no longer exists.
        Settings::set(($admin ? "admin_" : "") . 'theme', 'pancake');
    }

    $template = get_instance()->template;

    # Update asset paths and set new theme.
    $existing_theme = $template->get_theme_path();
    if ($existing_theme) {
        Asset::remove_path($existing_theme);
    }
    $template->set_theme($admin_prefix . $theme);
    Asset::add_path($template->get_theme_path());
}

function get_recurring_frequencies_labels($frequency = null) {
    $data = array(
        'w' => __('global:week'),
        'bw' => __('global:biweekly'),
        'm' => __('global:month'),
        'q' => __('global:quarterly'),
        's' => __('global:every_six_months'),
        'y' => __('global:year'),
        'b' => __('global:biyearly'),
        't' => __('global:triennially'),
    );

    return $frequency === null ? $data : $data[$frequency];
}

function get_recurring_frequencies_durations($frequency = null) {
    $data = array(
        'w' => "+1 week",
        'bw' => "+2 weeks",
        'm' => "+1 month",
        'q' => "+3 months",
        's' => "+6 months",
        'y' => "+1 year",
        'b' => "+2 years",
        't' => "+3 years",
    );

    return $frequency === null ? $data : $data[$frequency];
}

function implode_to_human_csv($array) {
    $array = implode(", ", $array);
    $search = ", ";
    $replace = " " . __("global:and") . " ";

    $pos = strrpos($array, $search);

    if ($pos !== false) {
        $array = substr_replace($array, $replace, $pos, strlen($search));
    }

    return $array;
}

function string_starts_with($haystack, $needle) {
    return $needle === "" || strpos($haystack, $needle) === 0;
}

function string_ends_with($haystack, $needle) {
    return $needle === "" || substr($haystack, -strlen($needle)) === $needle;
}

function human_invoice_type($type) {
    get_instance()->load->helper('inflector');

    switch ($type) {
        case 'CREDIT_NOTE':
        case 'ESTIMATE':
            $return = plural(strtolower($type));
            break;
        default:
            $return = 'invoices';
            break;
    }

    return $return;
}

/**
 * Currently only formats numbers to 2 digits.
 * If the original number needs more than 2 digits, more digits will be displayed,
 * up to 10 digits.
 * In the future, this will take into account region settings and format numbers accordingly.
 *
 * @param float $amount
 * @param bool  $maintain_precision
 */
function pancake_number_format($amount, $maintain_precision = false) {
    $precision_format = function ($amount, $precision = 2) {
        $result = pow(10, $precision);

        if (round(floor($amount * $result), $precision) == round($amount * $result, $precision)) {
            $res = sprintf("%.{$precision}f", $amount);
        } else {
            $res = $amount;
        }
        return $res;
    };

    $maximum_precision = $maintain_precision ? 10 : 2;

    $amount = round($amount, $maximum_precision);
    $amount = $precision_format($amount);

    $decimals_left = explode(".", $amount);
    $decimals_left = strlen(end($decimals_left));

    # Enforce 2 decimal places -at least-.
    if ($decimals_left == 1) {
        $decimals_left = 2;
    }

    # @todo take into account region settings
    $thousands_separator = ",";
    $decimal_separator = ".";

    return number_format($precision_format($amount), $decimals_left, $decimal_separator, $thousands_separator);
}

function elapsed_time() {
    return number_format(microtime(true) - REQUEST_TIME, 3);
}

/**
 * Detects whether a string was encrypted with the now-removed encrypt() helper.
 *
 * @param string $value
 * @return bool
 */
function is_encrypted(string $value): bool
{
    $search = '{"key_label":"';
    if (substr($value, 0, strlen($search)) == $search) {
        $original_value = $value;
        $value = json_decode($value, true);
        if ($value === null) {
            throw new InvalidArgumentException("Could not decrypt '$original_value': It's not a valid JSON string.");
        }

        return true;
    } else {
        return false;
    }
}

/**
 * Decrypts a value encrypted with the now-removed encrypt() helper.
 *
 * @param string $value JSON
 *
 * @return string
 * @throws InvalidArgumentException When $value is not a valid JSON string.
 * @throws DomainException When the key used to encrypt $value is not found in the DB.
 */
function decrypt(string $value): string
{
    if (is_encrypted($value)) {
        $CI = get_instance();
        $CI->load->library("encrypt");
        $CI->load->model("settings/key_m");
        $key_m = $CI->key_m;

        $value = json_decode($value, true);

        $key_label = $value['key_label'];
        $email_encrypt = $key_m->get_by(array("note" => $key_label));
        if (!empty($email_encrypt)) {
            return $CI->encrypt->decode($value['value'], $email_encrypt->key);
        } else {
            throw new DomainException("Could not find a key called '$key_label'. Was this value encrypted by this Pancake installation?");
        }
    } else {
        # It's not an encrypted string, return the original value.
        return $value;
    }
}

function get_max_upload_size() {

    $to_bytes = function ($val) {
        $val = trim($val);
        $last = strtolower($val[strlen($val) - 1]);
        $val = substr($val, 0, -1);
        switch ($last) {
            case 'g':
                $val *= 1024;
            case 'm':
                $val *= 1024;
            case 'k':
                $val *= 1024;
        }

        return $val;
    };

    $from_bytes = function ($bytes, $precision = 2) {
        $base = log($bytes) / log(1024);
        $suffixes = array('', 'KB', 'MB', 'GB', 'TB');
        return round(pow(1024, $base - floor($base)), $precision) . $suffixes[floor($base)];
    };

    $upload = $to_bytes(ini_get("upload_max_filesize"));
    $post = $to_bytes(ini_get("post_max_size"));
    $smallest = min(array($upload, $post));

    return $from_bytes($smallest);
}

/**
 * Does the same as reset(), without the "Only variables should be passed by reference" error.
 *
 * @param array $arr
 *
 * @return mixed
 */
function array_reset($arr) {
    return reset($arr);
}

/**
 * Does the same as end(), without the "Only variables should be passed by reference" error.
 *
 * @param array $arr
 *
 * @return mixed
 */
function array_end($arr) {
    return end($arr);
}

/**
 * Deprecated. Use Business::getLogo() instead.
 *
 * @param type $img_only
 * @param type $anchor
 * @param type $h
 * @param type $settings
 */
function logo($img_only = false, $anchor = true, $h = 1, $settings = null) {
    return Business::getLogo($img_only, $anchor, $h, $settings);
}

/**
 * Gets the JS used in the setup.js file.
 * It's here so that it can be used to calculate crc32() of the setup JS,
 * which is then use to create a filename based on the contents,
 * for filename-based cache-busting.
 *
 * @return string
 */
function get_setup_js() {
    $CI = get_instance();
    $CI->load->model('clients/clients_m');

    $data = array(
        "raw_site_url" => site_url("{url}"),
        "pancake_language_strings" => get_instance()->lang->language,
        "settings" => Settings::get_all(),
        "datePickerFormat" => get_date_picker_format(),
        "momentjs_parsable_formats" => get_momentjs_parsable_date_formats(),
        "momentjs_date_format" => get_momentjs_format(Settings::get("date_format")),
        "momentjs_time_format" => get_momentjs_format(Settings::get("time_format")),
        "task_time_interval" => format_hours(Settings::get('task_time_interval')),
        "pancake_demo" => IS_DEMO,
        "show_task_time_interval_help" => (process_hours(Settings::get('task_time_interval')) > 0),
        "pancake_taxes" => Settings::all_taxes(),
        "pancakeapp_com_base_url" => PANCAKEAPP_COM_BASE_URL,
        "manage_pancake_base_url" => MANAGE_PANCAKE_BASE_URL,
        "notification_poll_seconds" => Notify::get_poll_interval(),
        "default_currencies_per_client" => $CI->clients_m->get_default_currencies_per_client(),
    );

    $str = "var ";
    foreach ($data as $key => $value) {
        $str .= "$key = " . json_encode($value) . ",";
    }

    return substr($str, 0, -1) . ";";
}


/**
 * Processes a number in a string. If something like "$1,000.00" is passed, it strips the $ sign and comma, and returns 1000.
 *
 * Right now, it does not obey comma/dot user preferences, because there are none. This is what to use for parsing
 * numbers from now on, though. Once we add in user preferences for number formatting, it will be altered to obey them,
 * and if all code is using it for processing numbers, it'll make the switch a lot easier.
 *
 * @param $value
 * @return float
 */
function process_number($value) {
    if (empty($value)) {
        $value = (float) 0;
    } else {
        $value = str_ireplace(array(",", " ", "`"), "", $value);
        $regex = "/(-?(?:(?:[0-9]+(?:\\.[0-9]+)?)|(?:\\.[0-9]+)))/";
        $matches = array();
        $result = preg_match($regex, $value, $matches);
        if ($result === 1) {
            $value = (float) $matches[1];
        } else {
            $value = (float) 0;
        }
    }

    return $value;
}

function currency_formats() {
    $return = array();

    foreach (array("2", "0",) as $decimals) {
        $return_key = __("settings:decimal_places", array($decimals));
        $return[$return_key] = array();

        foreach (array("before", "after") as $symbol) {
            foreach (array(".", ",") as $decimal) {
                foreach (array(",", ".", " ",) as $thousand) {
                    $key = base64_encode(json_encode(array(
                        "symbol" => $symbol,
                        "decimal" => $decimal,
                        "thousand" => $thousand,
                        "decimals" => $decimals,
                    )));

                    if ($decimals > 0) {
                        if ($decimals == 2) {
                            $decimal_format = $decimal . "56";
                        } else {
                            $decimal_format = $decimal . str_repeat("0", $decimals);
                        }
                    } else {
                        $decimal_format = "";
                    }

                    $format = "1{$thousand}234" . $decimal_format;

                    if ($symbol == "before") {
                        $return[$return_key][$key] = "$ " . $format;
                    } else {
                        $return[$return_key][$key] = $format . " $";
                    }


                }
            }
        }
    }

    return $return;
}

function frontend_js() {
    $enabled_plugins = get_instance()->plugins_m->get_all_enabled();

    $string = Settings::get('frontend_js');
    $items = get_instance()->db->like("slug", ":frontend.js", 'before')->get("plugins")->result_array();

    foreach ($items as $item) {
        $plugin = array_reset(explode(":", $item['slug']));
        if (in_array($plugin, $enabled_plugins)) {
            $value = decrypt($item['value']);
            if (!empty($value)) {
                $string .= ";" . $value;
            }
        }
    }

    return $string;
}

function frontend_css() {
    $enabled_plugins = get_instance()->plugins_m->get_all_enabled();

    $string = Settings::get('frontend_css');
    $items = get_instance()->db->like("slug", ":frontend.css", 'before')->get("plugins")->result_array();

    foreach ($items as $item) {
        $plugin = array_reset(explode(":", $item['slug']));
        if (in_array($plugin, $enabled_plugins)) {
            $value = decrypt($item['value']);
            if (!empty($value)) {
                $string .= "\n" . $value;
            }
        }
    }

    return $string;
}

function backend_js() {
    $enabled_plugins = get_instance()->plugins_m->get_all_enabled();

    $string = Settings::get('backend_js');
    $items = get_instance()->db->like("slug", ":backend.js", 'before')->get("plugins")->result_array();

    foreach ($items as $item) {
        $plugin = array_reset(explode(":", $item['slug']));
        if (in_array($plugin, $enabled_plugins)) {
            $value = decrypt($item['value']);
            if (!empty($value)) {
                $string .= ";" . $value;
            }
        }
    }

    return $string;
}

function backend_css() {
    $enabled_plugins = get_instance()->plugins_m->get_all_enabled();

    $string = Settings::get('backend_css');
    $items = get_instance()->db->like("slug", ":backend.css", 'before')->get("plugins")->result_array();

    foreach ($items as $item) {
        $plugin = array_reset(explode(":", $item['slug']));
        if (in_array($plugin, $enabled_plugins)) {
            $value = decrypt($item['value']);
            if (!empty($value)) {
                $string .= "\n" . $value;
            }
        }
    }

    return $string;
}

function get_client_ids_with_valid_payment_tokens() {
    require_once APPPATH. "modules/gateways/gateway.php";
    return Gateway::get_clients_with_valid_tokens();
}

function table_to_csv($html, $stream = true, $attachment_filename = null) {
    $html = preg_replace("/&(?![A-Za-z0-9])/i", "&amp;", $html);
    $html = preg_replace("/<(?![!\\/A-Za-z0-9])/i", "&lt;", $html);
    $html = preg_replace("/<span class='hide-from-csv'>[^<]*?<\\/span>/i", "", $html);
    $html = explode("</table>", $html);
    $html = explode("<table", $html[1]);
    $html = "<table".$html[1];
    $matches = array();
    preg_match_all("/<tr.*?>(.*?)<\\/tr>/s", $html, $matches);
    $html = array();
    $doc = new DOMDocument();
    foreach ($matches[0] as $match) {
        $row = array();
        $doc->loadHTML('<?xml encoding="UTF-8">' . $match);
        $tds = $doc->getElementsByTagName('td');
        $ths = $doc->getElementsByTagName('th');
        foreach ($ths as $th) {
            $colspan = $th->getAttribute('colspan');
            $row[] = $th->nodeValue;
            if ($colspan > 0) {
                $colspan--;
                while ($colspan > 0) {
                    $row[] = "";
                    $colspan--;
                }
            }
        }

        foreach ($tds as $td) {
            $as = $td->getElementsByTagName('a');
            $remove = array();
            foreach ($as as $a) {
                if (stristr($a->getAttribute('class'), "hide-pdf") !== false) {
                    $remove[] = $a;
                }
            }
            foreach ($remove as $a) {
                $td->removeChild($a);
            }
            $row[] = $td->nodeValue;
        }

        $html[] = $row;
    }

    $filename = tempnam(PANCAKE_TEMP_DIR, "pancake-report-csv-");
    $file = fopen($filename, 'w+');
    foreach ($html as $row) {
        fputcsv($file, $row);
    }
    fclose($file);

    if ($stream) {
        header('Pragma: public');
        header('Content-type: text/csv');
        $attachment_filename = substr($attachment_filename, 0, -4) . ".csv";
        header('Content-disposition: attachment;filename=' . $attachment_filename);
        echo "\xef\xbb\xbf";
        echo file_get_contents($filename);
        @unlink($filename);
    } else {
        $contents = file_get_contents($filename);
        @unlink($filename);
        return $contents;
    }
}

function digit_to_tab_up($x) {
    $arr = [
        2 => "two-up",
        3 => "three-up",
        4 => "four-up",
        5 => "five-up",
    ];

    return isset($arr[$x]) ? $arr[$x] : "";
}

/* End of file: pancake_helper.php */