<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2011, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 2.1.0
 */
// ------------------------------------------------------------------------

/**
 * All public controllers should extend this library
 *
 * @subpackage	Libraries
 * @category	Libraries
 * @author		Sean Drumm
 */
class Email_Template {

    private $_theme_path;

    /**
     * Constructor, actually not needed in this case, maybe future
     *
     * @return void
     */
    function __construct() {
        if (isset($this->template)) {
            $this->_theme_path = $this->template->get_theme_path();
        }
    }

    /**
     * Build (return) the email template, will return false if the file is
     * not found
     *
     * @param string $view
     * @return string|bool Email template text or false when file is not found
     */
    public static function build(string $view, string $content, string $subject = ''): ?string {
        $CI = &get_instance();

        $logo_settings = $CI->dispatch_return('get_logo_settings', array('max-height' => 100, 'max-width' => 320), 'array');
        if (count($logo_settings) == 1) {
            # $logo_settings was modified by a plugin.
            $logo_settings = reset($logo_settings);
        }

        $logo_settings['is_email'] = true;
        $logo = \Business::getLogo(true, false, 1, $logo_settings);

        if (!empty($logo)) {
            $logo = str_ireplace("<span>", "<br /><span>", $logo) . "<br /><br />";
        }

        # Change the theme to the frontend theme to get the email template contents.
        switch_theme(false);
        $CI->_theme_path = $CI->template->get_theme_path();
        $file_location = $CI->_theme_path . 'views/emails/' . $view . '.php';

        if (!file_exists($file_location)) {
            $file_location = FCPATH . 'third_party/themes/pancake/views/emails/' . $view . '.php';
        }

        if (file_exists($file_location)) {
            $email_content = file_get_contents($file_location);
            # We don't use Mustache here because we want to inject HTML into the template.
            foreach (['content' => $content, 'logo' => $logo, 'subject' => $subject] as $var => $value) {
                $email_content = str_ireplace('{{' . $var . '}}', $value, $email_content);
            }
            # Change the theme back to the admin theme to keep things running smoothly.
            switch_theme(true);
            return $email_content;
        } else {
            show_error('Could not send the email. ' . $file_location . ' does not exist.');
            return null;
        }
    }

}
