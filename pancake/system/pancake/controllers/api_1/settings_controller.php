<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2015, Pancake Payments
 * @license        https://www.pancakeapp.com/license
 * @link           https://www.pancakeapp.com
 * @since          Version 4.8.45
 */

// ------------------------------------------------------------------------

/**
 * The Settings API controller
 *
 * @subpackage    Controllers
 * @category      API
 */
class Settings_controller extends REST_Controller {

    function version_get() {

        $version = Settings::get('version');

        $data = array(
            'pancake_version ' => $version,
            'php_version' => phpversion(),
            'protocol' => IS_SSL ? 'https' : 'http',
        );

        $this->response(array_merge(array(
            'status' => true,
            'message' => "Pancake {$version}",
        ), $data), 200);
    }

}