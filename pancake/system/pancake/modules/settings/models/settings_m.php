<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author        Pancake Dev Team
 * @copyright    Copyright (c) 2010, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link        http://pancakeapp.com
 * @since        Version 1.0
 */
// ------------------------------------------------------------------------

/**
 * The Settings Model
 *
 * @subpackage    Models
 * @category    Settings
 */
class Settings_m extends Pancake_Model {

    /**
     * @var string    The name of the settings table
     */
    protected $table = 'settings';

    /**
     * The custom stream options for SwiftMailer.
     * See http://php.net/manual/en/context.ssl.php for details on allowed options and values.
     *
     * @var array
     */
    protected $stream_options;

    public $inputs = array(
        "email_server",
        "smtp_host",
        "smtp_user",
        "smtp_pass",
        "smtp_port",
        "smtp_encryption",
        "secure_smtp_host",
        "secure_smtp_user",
        "secure_smtp_pass",
        "secure_smtp_port",
        "tls_smtp_host",
        "tls_smtp_user",
        "tls_smtp_pass",
        "tls_smtp_port",
        "mailpath",
        "gmail_user",
        "gmail_pass",
        "gapps_user",
        "gapps_pass",
    );

    /**
     * @var string    The primary key
     */
    public $primary_key = 'slug';

    /**
     * @var bool    Tells the model to skip auto validation
     */
    protected $skip_validation = TRUE;

    public function update_settings($settings) {

        Currency::switch_default($settings['currency']);

        $this->db->trans_begin();

        foreach ($settings as $slug => $value) {
            // This ensures we are only updating what has changed
            if (PAN::setting($slug) != $value) {
                $this->db->where('slug', $slug)->update($this->table, array('value' => $value));
            }
        }

        if ($this->db->trans_status() === FALSE) {
            $this->db->trans_rollback();
            return FALSE;
        }

        $this->db->trans_commit();

        // Refresh the settings cache
        $this->settings->reload();

        return TRUE;
    }

    function interpret_email_settings($settings = null) {
        if ($settings === null) {
            $settings = array(
                "email_type" => Settings::get('email_type'),
                "smtp_host" => Settings::get('smtp_host'),
                "smtp_user" => Settings::get('smtp_user'),
                "smtp_pass" => Settings::get('smtp_pass'),
                "smtp_port" => Settings::get('smtp_port'),
                "smtp_encryption" => Settings::get('smtp_encryption'),
                "email_secure" => Settings::get('email_secure'),
                "smtp_use_tls" => Settings::get('smtp_use_tls'),
            );
        }

        $type = $settings['email_type'];
        $host = str_ireplace('ssl://', '', $settings['smtp_host']);
        $user = $settings['smtp_user'];
        $pass = $settings['smtp_pass'];
        $port = $settings['smtp_port'];
        $encryption = isset($settings['smtp_encryption']) ? $settings['smtp_encryption'] : null;
        $secure = isset($settings['email_secure']) ? $settings['email_secure'] : false;
        $gmail_user = '';
        $gmail_pass = '';

        $host_is_gmail = stristr($host, 'gmail.com') !== false or stristr($host, 'googlemail.com') !== false;
        $has_gmail_user = $settings['smtp_user'] || Settings::get("gmail_email");

        if ($host_is_gmail && $has_gmail_user) {
            $encryption = "tls";
            $port = "25";
            $type = 'gmail';
            $gmail_pass = $pass;
            $gmail_user = $user;
        } elseif (stristr($host, 'ssl://') and $type == 'smtp') {
            $encryption = "ssl";
            $port = empty($port) ? 465 : $port;
        } elseif ($settings['smtp_use_tls'] == 1) {
            $encryption = "tls";
            $port = empty($port) ? 587 : $port;
        } elseif ($type != "smtp") {
            $type = "default";
        }

        $port = empty($port) ? 25 : $port;

        if ($secure) {
            $this->load->library('encrypt');
            $CI = &get_instance();
            $CI->load->model('settings/key_m');
            $email_encrypt = $CI->key_m->get_by(array("note" => 'email'));
            if (!empty($email_encrypt)) {
                $pass = $this->encrypt->decode($pass, $email_encrypt->key);
                $gmail_pass = $this->encrypt->decode($gmail_pass, $email_encrypt->key);
            }
        }

        return array(
            'type' => $type,
            'smtp_host' => $host,
            'smtp_user' => $user,
            'smtp_pass' => $pass,
            'smtp_port' => $port,
            'smtp_encryption' => $encryption,
            'gmail_user' => $gmail_user,
            'gmail_pass' => $gmail_pass,
        );
    }

    function random_key($length) {
        $random = '';
        for ($i = 0; $i < $length; $i++) {
            $random .= rand(0, 1) ? rand(0, 9) : chr(rand(ord('a'), ord('z')));
        }
        return $random;
    }

    function convert_input_to_settings($input) {
        $settings = array();
        $this->load->library('encrypt');
        $this->load->model('key_m');

        $email_encrypt = $this->key_m->get_by(array("note" => 'email'));

        if (empty($email_encrypt)) {
            $email_encrypt = new stdClass;
            $email_encrypt->key = $this->random_key(40);
            $this->key_m->insert_keys(array($email_encrypt->key), array('email'));
        }

        $type = $input['email_server'];
        $host = $input['smtp_host'];
        $user = $input['smtp_user'];
        $pass = $input['smtp_pass'];
        $pass = !empty($email_encrypt) ? $this->encrypt->encode($pass, $email_encrypt->key) : $pass;
        $port = $input['smtp_port'];
        $encryption = $input['smtp_encryption'];

        if (!empty($email_encrypt)) {
            $settings['email_secure'] = true;
        } else {
            $settings['email_secure'] = false;
        }

        if (isset($input['gmail_user'])) {
            $gmail_user = $input['gmail_user'];
            $gmail_pass = $input['gmail_pass'];
            $gmail_pass = !empty($email_encrypt) ? $this->encrypt->encode($gmail_pass, $email_encrypt->key) : $gmail_pass;

            if ($type == 'gmail') {
                $host = 'smtp.gmail.com';
                $user = $gmail_user;
                $pass = $gmail_pass;
                $type = 'smtp';
                $port = 465;
                $encryption = "ssl";
            } elseif ($type == 'default') {
                $host = "";
                $user = "";
                $pass = "";
                $type = "default";
                $port = "";
                $encryption = "";
            }
        }

        # Reset the smtp_use_tls setting.
        # This is not used anymore, but if it was 1 then it'd be intepreted by interpret_email_settings()
        # as being the old "SMTP (TLS)" setting, so we reset it here when saving settings again.
        $settings['smtp_use_tls'] = 0;

        $settings['email_type'] = $type;
        $settings['smtp_host'] = $host;
        $settings['smtp_user'] = $user;
        $settings['smtp_pass'] = $pass;
        $settings['smtp_port'] = $port;
        $settings['smtp_encryption'] = $encryption;

        return $settings;
    }

    function set_google_settings($email, $access_token, $refresh_token, $expiry_timestamp) {
        Settings::set("gmail_email", $email);
        Settings::set("gmail_access_token", $access_token);
        Settings::set("gmail_refresh_token", $refresh_token);
        Settings::set("gmail_expiry_timestamp", $expiry_timestamp);

        # Unset old settings.
        Settings::set("email_type", "gmail");
        Settings::set("smtp_host", "smtp.gmail.com");
        Settings::set("smtp_user", "");
        Settings::set("smtp_pass", "");
        Settings::set("smtp_port", "");
        Settings::set("smtp_encryption", "");
    }

    function unset_google_settings() {
        Settings::set("gmail_email", "");
        Settings::set("gmail_access_token", "");
        Settings::set("gmail_refresh_token", "");
        Settings::set("gmail_expiry_timestamp", "");
    }

    function get_oauth2gmail_url() {
        $this->load->config("oauth2_gmail");
        $client_id = $this->config->item("google_client_id");
        if (!empty($client_id)) {
            return site_url("admin/settings/oauth2gmail");
        } else {
            return PANCAKEAPP_COM_BASE_URL . "oauth2gmail?return_to=" . site_url("admin/settings/oauth2gmail");
        }
    }

    /**
     * Gets the custom stream options for SSL, if any are set.
     *
     * @return array
     */
    public function getStreamOptions() {
        if ($this->stream_options === null) {
            $stream_options = get_instance()->dispatch_return('set_stream_options', [], 'array');

            if (!empty($stream_options)) {
                # Process the plugin-changed array.
                $stream_options = array_reset($stream_options);
            }

            $this->stream_options = $stream_options;
        }

        return $this->stream_options;
    }

    function get_google_access_token() {
        $access_token = Settings::get("gmail_access_token");
        $refresh_token = Settings::get("gmail_refresh_token");
        $expiry_timestamp = Settings::get("gmail_expiry_timestamp");

        $access_token = $access_token ? $access_token : null;

        if ($expiry_timestamp <= time()) {
            # Refresh the token.
            if ($refresh_token) {
                $this->load->config("oauth2_gmail");
                $client_id = $this->config->item("google_client_id");
                if (!empty($client_id)) {
                    $provider = new League\OAuth2\Client\Provider\Google([
                        'clientId' => $this->config->item("google_client_id"),
                        'clientSecret' => $this->config->item("google_client_secret"),
                        'redirectUri' => site_url("admin/settings/oauth2gmail"),
                        'accessType' => 'offline',
                    ]);

                    $token = new \League\OAuth2\Client\Token\AccessToken([
                        "access_token" => $access_token,
                        "refresh_token" => $refresh_token,
                        "token_expires" => $expiry_timestamp,
                    ]);

                    $new_token = $provider->getAccessToken('refresh_token', [
                        'refresh_token' => $token->getRefreshToken(),
                    ]);

                    Settings::set("gmail_access_token", $new_token->getToken());
                    Settings::set("gmail_expiry_timestamp", $new_token->getExpires());
                    return $new_token->getToken();
                } else {
                    $data = [
                        # Default to Composer CA Bundle for calls to pancakeapp.com.
                        # Enforces the correctness of our TLS certificate.
                        "verify" => \Composer\CaBundle\CaBundle::getBundledCaBundlePath(),
                    ];
                    $stream_options = $this->getStreamOptions();
                    if (isset($stream_options["ssl"]["capath"])) {
                        $data["verify"] = $stream_options["ssl"]["capath"];
                    }
                    if (isset($stream_options["ssl"]["cafile"])) {
                        $data["verify"] = $stream_options["ssl"]["cafile"];
                    }
                    $guzzle = new GuzzleHttp\Client($data);
                    try {
                        $result = $guzzle->request("POST", PANCAKEAPP_COM_BASE_URL . "oauth2gmail-refresh", [
                            "form_params" => [
                                "access_token" => $access_token,
                                "refresh_token" => $refresh_token,
                                "token_expires" => $expiry_timestamp,
                            ],
                        ]);
                    } catch (\GuzzleHttp\Exception\ServerException $e) {
                        $message = "Could not obtain valid credentials for Gmail due to a server-side error. Sign in with Google again, and the problem will go away.";
                        if (IS_DEBUGGING) {
                            $message .= " " . $e->getResponse()->getBody()->getContents();
                        }
                        throw new \Pancake\Email\EmailGmailException($message, $e->getCode(), $e);
                    }
                    $original_body = $result->getBody()->getContents();
                    $result = json_decode($original_body, true);

                    if (isset($result["next_access_token"])) {
                        Settings::set("gmail_access_token", $result['next_access_token']);
                        Settings::set("gmail_expiry_timestamp", $result['next_token_expires']);
                        return $result['next_access_token'];
                    } elseif (isset($result["error"])) {
                        throw new \Pancake\Email\EmailGmailException($result["error"]);
                    } else {
                        $message = "Could not obtain valid credentials for Gmail. Sign in with Google again, and the problem will go away.";
                        if (IS_DEBUGGING) {
                            $message .= " " . $original_body;
                        }
                        throw new \Pancake\Email\EmailGmailException($message);
                    }
                }
            } else {
                throw new \Pancake\Email\EmailGmailException("Could not obtain valid credentials for Gmail because there is no refresh token to use. Sign in with Google again, and the problem will go away.");
            }
        } else {
            return $access_token;
        }
    }

    function save_email_settings($email) {
        $settings = $this->convert_input_to_settings($email);
        foreach ($settings as $key => $value) {
            Settings::set($key, $value);
        }

        if ($settings['email_type'] != "gmail") {
            # Remove gmail settings:
            Settings::set("gmail_email", "");
            Settings::set("gmail_access_token", "");
            Settings::set("gmail_refresh_token", "");
            Settings::set("gmail_expiry_timestamp", "");
        }

        return true;
    }

    function get_languages() {
        $var = scandir(APPPATH . 'language/');
        $ret = array();
        foreach ($var as $row) {
            if ($row != '.' and $row != '..' and is_dir(APPPATH . 'language/' . $row)) {
                $ret[$row] = humanize($row);
            }
        }
        return $ret;
    }

    function get_timezones() {
        $timezones = [
            'Pacific/Apia' => '(GMT-11:00) Midway Island, Samoa',
            'Pacific/Honolulu' => '(GMT-10:00) Hawaii',
            'America/Anchorage' => '(GMT-09:00) Alaska',
            'America/Los_Angeles' => '(GMT-08:00) Pacific Time (US and Canada); Tijuana',
            'America/Phoenix' => '(GMT-07:00) Arizona',
            'America/Denver' => '(GMT-07:00) Mountain Time (US and Canada)',
            'America/Chihuahua' => '(GMT-07:00) Chihuahua, La Paz, Mazatlan',
            'America/Managua' => '(GMT-06:00) Central America',
            'America/Regina' => '(GMT-06:00) Saskatchewan',
            'America/Mexico_City' => '(GMT-06:00) Guadalajara, Mexico City, Monterrey',
            'America/Chicago' => '(GMT-06:00) Central Time (US and Canada)',
            'America/Indiana/Indianapolis' => '(GMT-05:00) Indiana / Indianapolis',
            'America/Bogota' => '(GMT-05:00) Bogota, Lima, Quito',
            'America/New_York' => '(GMT-05:00) Eastern Time (US and Canada)',
            'America/Caracas' => '(GMT-04:00) Caracas, La Paz',
            'America/Santiago' => '(GMT-04:00) Santiago',
            'America/Halifax' => '(GMT-04:00) Atlantic Time (Canada)',
            'America/St_Johns' => '(GMT-03:30) Newfoundland',
            'America/Argentina/Buenos_Aires' => '(GMT-03:00) Buenos Aires, Georgetown',
            'America/Sao_Paulo' => '(GMT-03:00) Brasilia',
            'America/Noronha' => '(GMT-02:00) Mid-Atlantic',
            'Atlantic/Cape_Verde' => '(GMT-01:00) Cape Verde Is.',
            'Atlantic/Azores' => '(GMT-01:00) Azores',
            'Africa/Casablanca' => '(GMT) Casablanca, Monrovia',
            'Europe/London' => '(GMT) Greenwich Mean Time : Dublin, Edinburgh, Lisbon, London',
            'Africa/Lagos' => '(GMT+01:00) West Central Africa',
            'Europe/Berlin' => '(GMT+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna',
            'Europe/Paris' => '(GMT+01:00) Brussels, Copenhagen, Madrid, Paris',
            'Europe/Sarajevo' => '(GMT+01:00) Sarajevo, Skopje, Warsaw, Zagreb',
            'Europe/Belgrade' => '(GMT+01:00) Belgrade, Bratislava, Budapest, Ljubljana, Prague',
            'Africa/Johannesburg' => '(GMT+02:00) Harare, Pretoria',
            'Asia/Jerusalem' => '(GMT+02:00) Jerusalem',
            'Europe/Istanbul' => '(GMT+02:00) Athens, Istanbul, Minsk',
            'Europe/Helsinki' => '(GMT+02:00) Helsinki, Kyiv, Riga, Sofia, Tallinn, Vilnius',
            'Africa/Cairo' => '(GMT+02:00) Cairo',
            'Europe/Bucharest' => '(GMT+02:00) Bucharest',
            'Africa/Nairobi' => '(GMT+03:00) Nairobi',
            'Asia/Riyadh' => '(GMT+03:00) Kuwait, Riyadh',
            'Europe/Moscow' => '(GMT+03:00) Moscow, St. Petersburg, Volgograd',
            'Asia/Baghdad' => '(GMT+03:00) Baghdad',
            'Asia/Tehran' => '(GMT+03:30) Tehran',
            'Asia/Muscat' => '(GMT+04:00) Abu Dhabi, Muscat',
            'Asia/Tbilisi' => '(GMT+04:00) Baku, Tbilisi, Yerevan',
            'Asia/Kabul' => '(GMT+04:30) Kabul',
            'Asia/Karachi' => '(GMT+05:00) Islamabad, Karachi, Tashkent',
            'Asia/Yekaterinburg' => '(GMT+05:00) Ekaterinburg',
            'Asia/Kolkata' => '(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi',
            'Asia/Kathmandu' => '(GMT+05:45) Kathmandu',
            'Asia/Colombo' => '(GMT+06:00) Sri Jayawardenepura',
            'Asia/Dhaka' => '(GMT+06:00) Astana, Dhaka',
            'Asia/Novosibirsk' => '(GMT+06:00) Almaty, Novosibirsk',
            'Asia/Yangon' => '(GMT+06:30) Yangon',
            'Asia/Bangkok' => '(GMT+07:00) Bangkok, Hanoi, Jakarta',
            'Asia/Krasnoyarsk' => '(GMT+07:00) Krasnoyarsk',
            'Australia/Perth' => '(GMT+08:00) Perth',
            'Asia/Taipei' => '(GMT+08:00) Taipei',
            'Asia/Singapore' => '(GMT+08:00) Kuala Lumpur, Singapore',
            'Asia/Hong_Kong' => '(GMT+08:00) Beijing, Chongqing, Hong Kong, Urumqi',
            'Asia/Irkutsk' => '(GMT+08:00) Irkutsk, Ulaan Bataar',
            'Asia/Tokyo' => '(GMT+09:00) Osaka, Sapporo, Tokyo',
            'Asia/Seoul' => '(GMT+09:00) Seoul',
            'Asia/Yakutsk' => '(GMT+09:00) Yakutsk',
            'Australia/Darwin' => '(GMT+09:30) Darwin',
            'Australia/Adelaide' => '(GMT+09:30) Adelaide',
            'Pacific/Guam' => '(GMT+10:00) Guam, Port Moresby',
            'Australia/Brisbane' => '(GMT+10:00) Brisbane',
            'Asia/Vladivostok' => '(GMT+10:00) Vladivostok',
            'Australia/Hobart' => '(GMT+10:00) Hobart',
            'Australia/Sydney' => '(GMT+10:00) Canberra, Melbourne, Sydney',
            'Asia/Magadan' => '(GMT+11:00) Magadan, Solomon Is., New Caledonia',
            'Pacific/Fiji' => '(GMT+12:00) Fiji, Kamchatka, Marshall Is.',
            'Pacific/Auckland' => '(GMT+12:00) Auckland, Wellington',
            'Pacific/Tongatapu' => '(GMT+13:00) Nuku\'alofa',
        ];

        $replace_in_array = function ($old_key, $new_key, $array) {
            $new_array = [];
            foreach ($array as $key => $value) {
                if ($key == $old_key) {
                    $new_array[$new_key] = $value;
                } else {
                    $new_array[$key] = $value;
                }
            }

            return $new_array;
        };

        if (IS_DEBUGGING) {
            $identifiers = DateTimeZone::listIdentifiers();
            foreach ($timezones as $timezone => $label) {
                if (!in_array($timezone, $identifiers)) {
                    $convert = [
                        "Asia/Yangon" => "Asia/Rangoon",
                    ];

                    foreach ($convert as $old => $new) {
                        if (in_array($new, $identifiers)) {
                            $timezones = $replace_in_array($old, $new, $timezones);
                            continue 2;
                        }
                    }

                    throw_exception("The timezone '$timezone' is not valid.");
                }
            }
        }

        return $timezones;
    }

    public function get_default_variable_values($client_id) {
        $client = (array) $this->clients_m->get($client_id);
        $client['display_name'] = client_name($client);
        $client['access_url'] = site_url(\Settings::get('kitchen_route') . '/' . $client['unique_id']);

        $current_business_id = \Business::getBusinessId();
        \Business::setBusinessFromClient($client_id);

        $logo = \Business::getLogoUrl();
        $business = \Business::getBusiness();
        $user_display_name = logged_in() ? ($this->current_user->first_name . ' ' . $this->current_user->last_name) : \Business::getAdminName();

        \Business::setBusiness($current_business_id);

        return array(
            'settings' => (array) Settings::get_all(),
            'business' => $business,
            'client' => $client,
            'logo' => $logo,
            'user_display_name' => $user_display_name,
        );
    }

}

/* End of file: settings_m.php */