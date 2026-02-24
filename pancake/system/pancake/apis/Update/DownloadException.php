<?php

/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application.
 *
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

namespace Pancake\Update;

/**
 * Update System Exceptions.<br />Thrown by the Update System when something goes wrong with downloading an update.
 *
 * @category Update System
 * @package  Pancake
 * @author   Pancake Dev Team <support@pancakeapp.com>
 * @license  http://pancakeapp.com/license Pancake End User License Agreement
 * @link     http://pancakeapp.com
 */
class DownloadException extends \Pancake\PancakeException {

    const MESSAGE_UPDATE = "update";
    const MESSAGE_CHANGELOG = "changelog";
    const MESSAGE_HASHES = "integrity verification files";

    public function __construct($message) {
        parent::__construct("An unknown issue occurred while downloading the Pancake ".ucwords($message).".");
    }

}
