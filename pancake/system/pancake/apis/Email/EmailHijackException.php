<?php

/**
 * Pancake
 * A simple, fast, self-hosted invoicing application.
 * PHP version 5.3+
 *
 * @category  APIs
 * @package   Pancake
 * @author    Pancake Dev Team <support@pancakeapp.com>
 * @copyright 2015 Pancake Payments
 * @license   http://pancakeapp.com/license Pancake End User License Agreement
 * @link      http://pancakeapp.com
 * @since     4.8.37
 */

namespace Pancake\Email;

/**
 * Email Hijacked Exceptions.<br />
 * Thrown by the Email System when it tries to SMTP to a given host and encounters a different host instead.
 *
 * @category Email
 * @package  Pancake
 * @author   Pancake Dev Team <support@pancakeapp.com>
 * @license  https://www.pancakeapp.com/license Pancake End User License Agreement
 * @link     https://www.pancakeapp.com
 */
class EmailHijackException extends \Pancake\Email\EmailException {

    /**
     * @var string
     */
    protected $expected_host;

    /**
     * @var string
     */
    protected $actual_host;

    /**
     * @return string
     */
    public function getActualHost() {
        return $this->actual_host;
    }

    /**
     * @param string $actual_host
     */
    public function setActualHost($actual_host) {
        $this->actual_host = $actual_host;
    }

    /**
     * @return string
     */
    public function getExpectedHost() {
        return $this->expected_host;
    }

    /**
     * @param string $expected_host
     */
    public function setExpectedHost($expected_host) {
        $this->expected_host = $expected_host;
    }


}
