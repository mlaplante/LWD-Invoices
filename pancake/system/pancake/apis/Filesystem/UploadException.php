<?php

/**
 * Pancake
 * A simple, fast, self-hosted invoicing application.
 *
 * @category  APIs
 * @package   Pancake
 * @author    Pancake Dev Team <support@pancakeapp.com>
 * @copyright 2016 Pancake Payments
 * @license   https://www.pancakeapp.com/license Pancake End User License Agreement
 * @link      https://www.pancakeapp.com
 * @since     4.12.18
 */

namespace Pancake\Filesystem;

/**
 * Upload Exceptions.<br />Thrown by \Pancake\Filesystem when something went wrong with an upload.
 *
 * @category Filesystem
 * @package  Pancake
 * @author   Pancake Dev Team <support@pancakeapp.com>
 * @license  https://www.pancakeapp.com/license Pancake End User License Agreement
 * @link     https://www.pancakeapp.com
 */
class UploadException extends \Pancake\PancakeException {

    static $error_messages = array(
        Filesystem::UPLOAD_ERROR_EXTENSION => 'global:upload_not_allowed',
        UPLOAD_ERR_INI_SIZE => 'global:upload_ini_size',
        UPLOAD_ERR_FORM_SIZE => 'global:upload_ini_size',
        UPLOAD_ERR_PARTIAL => 'global:upload_error',
        UPLOAD_ERR_NO_FILE => 'No file was uploaded.',
        UPLOAD_ERR_CANT_WRITE => 'global:upload_error',
        UPLOAD_ERR_NO_TMP_DIR => 'global:upload_error',
        UPLOAD_ERR_EXTENSION => 'global:upload_error',
    );

    protected $errors = [];

    /**
     * Construct the exception.
     *
     * @param array                 $errors An array of filename => upload error pairs.
     * @param \Throwable|\Exception $previous
     */
    function __construct($errors, $previous = null) {
        $message = "";
        $this->errors = $errors;

        foreach ($errors as $filename => $code) {
            $extension = pathinfo($filename, PATHINFO_EXTENSION);

            if ($code == Filesystem::UPLOAD_ERROR_EXTENSION) {
                $message .= __(static::$error_messages[$code], [$extension]) . "\n";
            } else {
                $message .= __(static::$error_messages[$code], [get_max_upload_size()]) . "\n";
            }
        }

        parent::__construct($message, 0, $previous);
    }

    public function getErrors() {
        return $this->errors;
    }

}
