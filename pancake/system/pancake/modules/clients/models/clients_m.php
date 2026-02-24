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
 * The Clients Model
 *
 * @subpackage	Models
 * @category	Clients
 */
class Clients_m extends Pancake_Model {

    /**
     * @var	string	The name of the clients table
     */
    protected $table = 'clients';
    protected $validate = array(
        array(
            'field' => 'first_name',
            'label' => 'First Name',
            'rules' => ''
        ),
        array(
            'field' => 'email',
            'label' => 'Email',
            'rules' => 'required|valid_emails'
        ),
    );

    function build_permitted_clients_dropdown($item_type, $action, $count_type = '', $empty_label = null, $empty_value = '') {

        if ($empty_label === null) {
            $empty_label = __('global:select');
        }

        $dropdown_array = array($empty_value => $empty_label);
        $clients_dropdown_array = array();
        $assigned_clients = $this->assignments->get_clients_involved($item_type, $action);
        if (count($assigned_clients) > 0) {
            $this->db->where_in('id', $assigned_clients, false);
            $clients = $this->order_by('first_name')->get_all();
        } else {
            $clients = array();
        }
        foreach ($clients as $client) {
            $buffer = $count_type != '' ? ' (' . get_count($count_type, $client->id) . ')' : '';
            $client_name = client_name($client);
            $clients_dropdown_array += array($client->id => $client_name . $buffer);
        }

        if (Events::has_listeners('sort_clients')) {
            $clients_dropdown_array = get_instance()->dispatch_return('sort_clients', $clients_dropdown_array, 'array');
            $clients_dropdown_array = reset($clients_dropdown_array);
        }

        return $dropdown_array + $clients_dropdown_array;
    }

    function get_business_identity_per_client($client_id = null) {
        static $client_identities;

        if ($client_identities === null) {
            $identities = $this->business_identities_m->getAllBusinessesDropdown();
            $first_business = array_reset(array_keys($identities));
            $this->db->select('id, business_identity');
            $buffer = $this->db->get('clients')->result_array();
            $client_identities = [];
            foreach ($buffer as $row) {
                if (isset($identities[$row['business_identity']])) {
                    $client_identities[$row['id']] = (int) $row['business_identity'];
                } else {
                    $client_identities[$row['id']] = (int) $first_business;
                }
            }
        }

        return $client_id ? $client_identities[$client_id] : $client_identities;
    }

    function get_default_currencies_per_client() {
        where_assigned('clients', 'read');
        $this->db->select("id, default_currency_code");
        $clients = [];
        foreach ($this->db->get($this->table)->result_array() as $client) {
            $clients[$client['id']] = $client['default_currency_code'];
        }
        return $clients;
    }

    function count() {
        where_assigned('clients', 'read');
        return $this->db->count_all_results($this->table);
    }

    function exists($id) {
        if ($id > 0) {
            return $this->db->where("id", $id)->count_all($this->table) > 0;
        } else {
            return false;
        }
    }


    function count_all() {
        # Override the original function to take into account User Permissions.
        return $this->count();
    }

    public function get_balance($client_id, $date = null, $currency_code = null) {
        $CI = &get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('invoices/partial_payments_m', 'ppm');
        $CI->load->model('clients/clients_credit_alterations_m');
        
        if ($date === null) {
            $date = time();
        }

        $credit_note_total = $CI->invoice_m->get_credit_notes_total($client_id, $date, $currency_code);
        $altered_balance = $CI->clients_credit_alterations_m->get_altered_balance($client_id, $date);
        $balance_payments_total = $CI->ppm->get_balance_payments_total($client_id, $date, $currency_code);

        return $credit_note_total + $altered_balance - $balance_payments_total;
    }

    /**
     * Get whether or not a client has ever had credit.
     *
     * @param integer $client_id
     *
     * @return bool
     */
    public function get_has_had_credit($client_id) {
        $credit_notes = $this->db->where("type", "CREDIT_NOTE")->where("client_id", $client_id)->count_all_results("invoices");
        if ($credit_notes > 0) {
            return true;
        }

        $credit_alterations = $this->db->where("client_id", $client_id)->count_all_results("clients_credit_alterations");
        if ($credit_alterations > 0) {
            return true;
        }

        return false;
    }

    function health($id) {
        $client_totals = $this->get_client_totals($id);

        $invoice_total = $client_totals['unpaid_totals']['total'] + $client_totals['paid_totals']['total'];
        $health = array();
        if ($invoice_total > 0) {
            $health['overdue'] = round(($client_totals['overdue_totals']['total'] / $invoice_total) * 100, 2);
            $health['paid'] = round(($client_totals['paid_totals']['total'] / $invoice_total) * 100, 2);
            $health['unpaid'] = round(($client_totals['unpaid_totals']['total'] / $invoice_total) * 100, 2);
            $health['overall'] = 100 - $health['unpaid'];
        } else {
            $health = array('overdue' => 0, 'paid' => 100, 'unpaid' => 0, 'overall' => 100);
        }
        return $health;
    }

    function getUniqueIdById($id) {
        $buffer = $this->db->select('unique_id')->where('id', $id)->get($this->table)->row_array();
        return isset($buffer['unique_id']) ? $buffer['unique_id'] : '';
    }

    function getById($id) {
        $buffer = $this->db->where('id', $id)->get($this->table)->row_array();
        if (isset($buffer['unique_id'])) {
            $buffer['access_url'] = site_url(Settings::get('kitchen_route') . '/' . $buffer['unique_id']);
        }
        return $buffer;
    }

    function find_client($company, $first = '', $last = '') {
        $clients = $this->db->get_where($this->table, array('company' => $company))->result_array();
        if (count($clients) != 0) {
            foreach ($clients as $client) {
                if ($client['last_name'] == $last and $client['first_name'] == $first) {
                    return $client;
                }
            }
        }
        return false;
    }

    function find_client_by_login($email, $passphrase) {
        return $this->db->where("email", $email)->where("passphrase", $passphrase)->get("clients")->row();
    }

    function get_clients_csv() {
        $this->load->model('clients/clients_meta_m');

        $return = array(
            "fields" => array("Title", "First Name", "Last Name", "Email", "Company", "Address", "Telephone Number", "Fax Number", "Mobile Number", "Website URL", "Notes", "Client Area URL", "Client Area Passphrase", "Language"),
            "records" => array(),
        );
        $buffer = $this->db->get($this->table)->result_array();

        $rows = $this->db->select('client_id, tax_id, tax_registration_id')->get('clients_taxes')->result_array();
        $all_tax_reg_data = [];
        foreach ($rows as $row) {
            if (!isset($all_tax_reg_data[$row['client_id']])) {
                $all_tax_reg_data[$row['client_id']] = [];
            }

            if (!isset($all_tax_reg_data[$row['client_id']][$row['tax_id']])) {
                $all_tax_reg_data[$row['client_id']][$row['tax_id']] = $row['tax_registration_id'];
            }
        }

        $rows = $this->db->select('client_id, slug, label, value')->get('clients_meta')->result_array();
        $all_custom_data = [];
        $custom_data_fields = $this->clients_meta_m->fetch_fields();
        foreach ($rows as $row) {
            if (!isset($all_custom_data[$row['client_id']])) {
                $all_custom_data[$row['client_id']] = [];
            }

            if (!isset($all_custom_data[$row['client_id']][$row['slug']])) {
                $all_custom_data[$row['client_id']][$row['slug']] = $row['value'];
            }
        }

        $taxes = Settings::tax_dropdown();
        unset($taxes[0]);

        foreach ($buffer as $row) {
            $data = array(
                "Title" => $row['title'],
                "First Name" => $row['first_name'],
                "Last Name" => $row['last_name'],
                "Email" => $row['email'],
                "Company" => $row['company'],
                "Address" => $row['address'],
                "Telephone Number" => $row['phone'],
                "Fax Number" => $row['fax'],
                "Mobile Number" => $row['mobile'],
                "Website URL" => $row['website'],
                "Notes" => $row['profile'],
                "Client Area URL" => site_url(Settings::get('kitchen_route') . '/' . $row['unique_id']),
                "Client Area Passphrase" => $row['passphrase'],
                "Language" => $row['language'],
            );

            foreach ($taxes as $tax_id => $tax) {
                if (isset($all_tax_reg_data[$row['id']][$tax_id])) {
                    $data[$tax] = $all_tax_reg_data[$row['id']][$tax_id];
                } else {
                    $data[$tax] = '';
                }
            }

            foreach ($custom_data_fields as $slug => $field) {
                $label = $field["label"];

                if (isset($all_custom_data[$row['id']][$slug])) {
                    $data[$label] = $all_custom_data[$row['id']][$slug];
                } else {
                    $data[$label] = '';
                }
            }

            $return["records"][] = $data;
        }

        if (!empty($return["records"])) {
            $return["fields"] = array_keys(array_reset($return["records"]));
        }

        return $return;
    }

    public function get_filtered($prefix, $limit, $offset) {
        $dropdown = $this->build_permitted_clients_dropdown("clients", "read");

        # Remove the '--- Select ---' option.
        unset($dropdown['']);

        # Remove name titles.
        $titles = array_map(function ($value) {
            return preg_quote($value['title'], "/");
        }, $this->db->distinct()->select('title')->get('clients')->result_array());

        $regex = "/(?:\\b|\\s)+?(?:" . implode("|", $titles) . ")+\.?(?:\\s|\\b)+/";
        $dropdown = preg_replace($regex, "", $dropdown);

        # Filter clients.
        $allowed_clients = array_filter($dropdown, function ($value) use ($prefix) {
            return substr(mb_strtolower($value), 0, strlen($prefix)) == $prefix;
        });

        $count = count($allowed_clients);

        $allowed_ids = array_slice(array_keys($allowed_clients), $offset, $limit);

        if (count($allowed_ids) > 0) {
            # The build_permitted_clients_dropdown() is already sorted and obeys custom plugins.
            # This is here so that the query obeys whatever order the clients dropdown was already in.
            $this->db->qb_orderby[] = "field(id, " . implode(",", $allowed_ids) . ")";

            $this->db->where_in("id", $allowed_ids);

            $clients = $this->get_all();
        } else {
            $clients = [];
        }

        return ["count" => $count, "clients" => $clients];
    }

    function get_all_client_ids() {
        $buffer = $this->db->select('id')->get($this->table)->result_array();
        $clients = array();
        foreach ($buffer as $client) {
            $clients[] = $client['id'];
        }
        return $clients;
    }

    function get_for_kitchen($unique_id) {
        $CI = get_instance();
        $this->load->model('invoices/invoice_m');
        $client = $this->db->where('unique_id', $unique_id)->get('clients')->row();
        if (isset($client->id)) {
            $client->paid_total = $CI->invoice_m->paid_totals($client->id, null, true, $client->default_currency_code);
            $client->paid_total = $client->paid_total['total'];
            $client->unpaid_total = $CI->invoice_m->unpaid_totals($client->id, null, true, $client->default_currency_code);
            $client->unpaid_total = $client->unpaid_total['total'];
            $client->credit_balance = $this->clients_m->get_balance($client->id, null, $client->default_currency_code);
        }
        return $client;
    }

    function getBusinessIdentity($client_id) {
        $buffer = $this->db->select("business_identity")->where("id", $client_id)->get("clients")->row_array();
        return isset($buffer['business_identity']) ? $buffer['business_identity'] : Business::ANY_BUSINESS;
    }

    function delete($id) {
        $CI = &get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('projects/project_m');
        $CI->load->model('proposals/proposals_m');
        $CI->invoice_m->delete_by_client_id($id);
        $CI->project_m->delete_by_client($id);
        $CI->proposals_m->delete_by_client($id);
        return $this->db->where($this->primary_key, $id)->delete($this->table);
    }

    /**
     * Inserts a new client
     *
     * @access 	public
     * @param 	array 	the client array
     * @return 	int
     */
    public function insert($data, $skip_validation = false) {
        $data['unique_id'] = $this->_generate_unique_id();
        if (isset($data['created']) and is_numeric($data['created'])) {
            # $data['created'] is a timestamp and needs to be converted to MySQL format.
            $data['created'] = date('Y-m-d H:i:s', $data['created']);
        }
        if (isset($data['modified']) and is_numeric($data['modified'])) {
            # $data['modified'] is a timestamp and needs to be converted to MySQL format.
            $data['modified'] = date('Y-m-d H:i:s', $data['modified']);
        }

        if (isset($data['random_passphrase'])) {
            $data['passphrase'] = $this->random_passphrase();
            unset($data['random_passphrase']);
        }

        if (isset($data['email_client'])) {
            // send the email
            unset($data['email_client']);
        }

        if (isset($data['support_user_id'])) {
            $data['support_user_id'] = (int) $data['support_user_id'];
        }

        if (!isset($data['created'])) {
            $data['created'] = date('Y-m-d H:i:s');
        }
        
        $data['owner_id'] = current_user();

        return parent::insert($data, $skip_validation);
    }

    public function update($client_id, $data, $skip_validation = false) {

        if (isset($data['email_client'])) {
            // send the email
            unset($data['email_client']);
        }

        if (isset($data['random_passphrase'])) {
            $data['passphrase'] = $this->random_passphrase();
            unset($data['random_passphrase']);
        }

        if (isset($data['support_user_id'])) {
            $data['support_user_id'] = (int) $data['support_user_id'];
        }

        return parent::update($client_id, $data, $skip_validation);
    }

    public static function random_passphrase() {
        $dict_file = "/usr/share/dict/words";
        $passphrase = '';

        // Uhh. just realized. needs a naughty word filter
        if (false && is_file($dict_file) && is_readable($dict_file)) {
            $content = file_get_contents($dict_file);
            $words = explode("\n", $content);
            unset($content); // too beeg

            $options = array_rand($words, 4);
            foreach ($options as $key => $value) {
                $passphrase .= $words[$value] . ' ';
            }

        } else {
            $characters = '23456789abcdefghjkmnopqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
            for ($i = 0; $i < 20; $i++) {
                $passphrase .= $characters[rand(0, strlen($characters) - 1)];
            }
        }
        return trim($passphrase);
    }

    // --------------------------------------------------------------------

    /**
     * Resets the client's unique id
     *
     * @access 	public
     * @param 	array 	the client array
     * @return 	int
     */
    public function reset_unique_id($id) {
        $data['unique_id'] = $this->_generate_unique_id();
        return parent::update($id, $data, TRUE);
    }

    public function search($query) {
        $clients = $this->db->select('id, title, first_name, last_name, company, email')->get('clients')->result_array();

        $buffer = array();
        $details = array();
        $query = strtolower($query);

        foreach ($clients as $row) {
            $subbuffer = array();
            $name = "{$row['title']} {$row['first_name']} {$row['last_name']}";
            $name = trim($name);

            $subbuffer[] = levenshtein($query, strtolower($row['email']), 1, 20, 20);
            if (!empty($row['company'])) {
                $subbuffer[] = levenshtein($query, strtolower($row['company']), 1, 20, 20);
            }
            if (!empty($name)) {
                $subbuffer[] = levenshtein($query, strtolower($name), 1, 20, 20);
            }

            $full_match = "$name".($row['company'] ? " - {$row['company']}" : "");
            $subbuffer[] = levenshtein($query, strtolower($full_match), 1, 20, 20);

            $full_match = client_name($row);
            $subbuffer[] = levenshtein($query, strtolower($full_match), 1, 20, 20);

            sort($subbuffer);

            $buffer[$row['id']] = reset($subbuffer);
            $details[$row['id']] = $full_match;
        }

        asort($buffer);
        $return = array();

        foreach (array_slice($buffer, 0, 3, true) as $id => $levenshtein) {
            $return[] = array(
                'levenshtein' => $levenshtein,
                'name' => $details[$id],
                'id' => $id
            );
        }

        return $return;
    }

    function get_client_totals($client_id) {
        $client_invoices = $this->invoice_m->flexible_get_all(array('client_id' => $client_id, 'archived' => false, 'include_totals' => true));
        $unique_ids = array_map(function($invoice) {
            return $invoice->unique_id;
        }, $client_invoices);

        return $this->ppm->get_totals(array_values($unique_ids));
    }

    function process_clients(&$clients) {
        $CI = get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('invoices/partial_payments_m');
        $CI->load->model('projects/project_m');

        $this->partial_payments_m->cache_totals(array_map(function ($client) {
            return $client->id;
        }, $clients));

        foreach ($clients as &$client) {
            $client->url = null;

            if ($client->website) {
                $url = parse_url($client->website);
                if (!isset($url["scheme"])) {
                    $url["scheme"] = "http";
                }

                $client->url = http_build_url($url);
            }

            $client->health = $this->health($client->id);
            $paid_total = $CI->invoice_m->paid_totals($client->id);
            $unpaid_total = $CI->invoice_m->unpaid_totals($client->id);
            $client->paid_total = $paid_total['total'];
            $client->unpaid_total = $unpaid_total['total'];
            $client->project_count = $CI->project_m->get_count_by_client($client->id);
        }
    }

    function send_client_area_email($client_id, $message = null, $subject = null, $emails = null) {
        $client = $this->getById($client_id);

        if (!isset($client['id'])) {
            return false;
        }

        $emails = $emails ? $emails : $client['email'];
        if (!is_array($emails)) {
            $emails = explode(",", $emails);
        }

        $result = Pancake\Email\Email::send(array(
            'to' => $emails,
            'template' => 'client_area_details',
            'client_id' => $client_id,
            'data' => array('client' => $client),
            'subject' => $subject,
            'message' => $message,
        ));

        if ($result) {
            return $emails;
        } else {
            return false;
        }
    }

    function fetch_details($first_name, $last_name = '', $organization = '', $email = '', $additional_data = array()) {

        if (empty($last_name) and empty($organization) and empty($email) and is_numeric($first_name)) {
            $client = $this->db->like('profile', '[ORIGINAL_CLIENT_ID='.$first_name.']')->get($this->table)->row_array();
            if (isset($client['id']) and !empty($client['id'])) {
                return $client;
            }
        }

        $count_company = $this->db->where('company', $organization)->count_all_results($this->table);
        if ($count_company > 0) {
            $this->db->where('company', $organization);

            if (!empty($first_name)) {
                $this->db->where('first_name', $first_name);
            }
            if (!empty($last_name)) {
                $this->db->where('last_name', $last_name);
            }

            $result = $this->db->get($this->table)->row_array();
            if (isset($result['id']) and !empty($result['id'])) {
                return $result;
            }
        }

        # If it got this far, it needs to create the client.
        if (empty($first_name)) {
            $first_name = ' ';
        }

        if (empty($last_name)) {
            $last_name = ' ';
        }

        $this->insert(array_merge(array(
            'first_name' => $first_name,
            'last_name' => $last_name,
            'company' => $organization,
            'email' => empty($email) ? Business::getNotifyEmail() : $email
        ), $additional_data));

        $result = $this->db->get_where($this->table, array('id' => $this->db->insert_id()))->row_array();
        $result['new_client'] = true;
        return $result;
    }

    // --------------------------------------------------------------------

    /**
     * Generates the unique id for a client
     *
     * @access	public
     * @return	string
     */
    public function _generate_unique_id() {

        static $unique_ids = null;

        if ($unique_ids === null) {
            $buffer = $this->db->select('unique_id')->get($this->table)->result_array();
            $unique_ids = array();

            foreach ($buffer as $row) {
                $unique_ids[$row['unique_id']] = $row['unique_id'];
            }
        }

        $this->load->helper('string');

        $valid = false;
        while ($valid === false) {
            $unique_id = random_string('alnum', 8);
            if (!isset($unique_ids[$unique_id])) {
                $valid = true;

                # Add this unique ID to list of IDs, because it'll be created.
                $unique_ids[$unique_id] = $unique_id;

            }
        }

        return $unique_id;
    }

    public static function get_all_gravatars($size = 60)
    {
        return once(function () use ($size) {
            $records = get_instance()->db->select('id, email')->get('clients')->result_array();
            $records = collect($records);
            return $records->map(function ($row) use ($size) {
                $row['gravatar'] = get_gravatar($row['email'], $size);
                return $row;
            })->pluck('gravatar', 'id')->toArray();
        });
    }

    function get_gravatar(int $client_id, int $size = 60): ?string
    {
        return static::get_all_gravatars($size)[$client_id] ?? null;
    }

    function get_human_value($record_id) {
        if (empty($this->human_value_cache)) {
            $has_listeners = Events::has_listeners('client_name_generated');
            $mustache = get_instance()->mustache;

            $results = $this->db->get($this->table)->result_array();
            foreach ($results as $result) {
                $format = "{{title}} {{first_name}} {{last_name}} {{#first_name}}{{#company}}-{{/company}}{{/first_name}} {{company}}";
                $default_name = $mustache->render($format, $result);
                $default_name = preg_replace("/( +)/", " ", $default_name);
                $default_name = trim($default_name);

                if ($has_listeners) {
                    $name = get_instance()->dispatch_return('client_name_generated', array(
                        'record' => $result,
                        'generated_name' => $default_name,
                    ));
                } else {
                    $name = $default_name;
                }

                $this->human_value_cache[$result[$this->primary_key]] = $name;
            }
        }

        if (isset($this->human_value_cache[$record_id])) {
            return $this->human_value_cache[$record_id];
        } else {
            return __("global:na");
        }
    }

    public function forgotten_password($id, $email): bool
    {
        $key = $this->ion_auth_model->hash_password(microtime() . $email);
        $this->update($id, [
            "forgotten_password_code" => $key,
        ], true);

        $data = [
            'identity' => $email,
            'forgotten_password_code' => $key
        ];

        $message = $this->load->view($this->config->item('email_templates', 'ion_auth') . $this->config->item('email_forgot_password', 'ion_auth'), $data, true);
        $subject = $this->config->item('site_title', 'ion_auth') . ' - ' . __("email_forgotten_password_subject");

        if (\Pancake\Email\Email::sendRaw($email, $subject, $message)) {
            $this->ion_auth->set_message('forgot_password_successful');
            return true;
        } else {
            $this->ion_auth->set_error('cant_send_email');
            return false;
        }
    }

    public function forgotten_password_complete($code): bool
    {
        $client = $this->get_by([
            'forgotten_password_code' => $code,
        ]);

        if (!is_object($client)) {
            return false;
        }

        $email = $client->email;

        $new_password = $this->random_passphrase();

        $this->update($client->id, [
            "passphrase" => $new_password,
            "forgotten_password_code" => null,
        ], true);

        $data = [
            'identity' => $email,
            'new_password' => $new_password
        ];

        $message = $this->load->view($this->config->item('email_templates', 'ion_auth') . $this->config->item('email_forgot_password_complete', 'ion_auth'), $data, true);
        $subject = $this->config->item('site_title', 'ion_auth') . ' - ' . __("email_new_password_subject");

        if (\Pancake\Email\Email::sendRaw($email, $subject, $message)) {
            $this->ion_auth->set_message('password_change_successful');
            return true;
        } else {
            $this->ion_auth->set_error('cant_send_email');
            return false;
        }
    }

}

/* End of file: settings_m.php */