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
 * Update System Exceptions.<br />Thrown by the Update System some files failed to be updated.
 *
 * @category Update System
 * @package  Pancake
 * @author   Pancake Dev Team <support@pancakeapp.com>
 * @license  http://pancakeapp.com/license Pancake End User License Agreement
 * @link     http://pancakeapp.com
 */
class UpdateException extends \Pancake\PancakeException {

    public function __construct($original_version, $target_version, $failed_changes = array()) {
        $extra = "";

        if (count($failed_changes) < 10) {
            $extra = "<ul style='list-style: disc;margin-left: 15px;font-size: 13px;'><li style='word-wrap: break-word;margin-bottom: 0.25em;'>" . implode("</li><li style='word-wrap: break-word;margin-bottom: 0.25em;'>", array_keys($failed_changes))."</li></ul>";
        }

        parent::__construct("Could not finish update from $original_version to $target_version. " . count($failed_changes) . " files were not updated correctly." . $extra);
    }

}
