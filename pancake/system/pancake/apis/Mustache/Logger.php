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
 * @since     4.12.11
 */

namespace Pancake\Mustache;

/**
 * A Mustache Logger.
 * The Exception Logger throws all log messages over the threshold level as \Pancake\Mustache\Exception.
 */
class Logger extends \Mustache_Logger_AbstractLogger {
    protected static $levels = array(
        self::DEBUG => 100,
        self::INFO => 200,
        self::NOTICE => 250,
        self::WARNING => 300,
        self::ERROR => 400,
        self::CRITICAL => 500,
        self::ALERT => 550,
        self::EMERGENCY => 600,
    );

    protected $level;
    protected $stream = null;
    protected $url = null;

    /**
     * @throws \InvalidArgumentException if the logging level is unknown
     *
     * @param int|string      $level  The minimum logging level at which this handler will be triggered
     */
    public function __construct($level = self::ERROR) {
        $this->setLevel($level);
    }

    /**
     * Set the minimum logging level.
     *
     * @throws \Mustache_Exception_InvalidArgumentException if the logging level is unknown
     *
     * @param int $level The minimum logging level which will be written
     */
    public function setLevel($level) {
        if (!array_key_exists($level, self::$levels)) {
            throw new \Mustache_Exception_InvalidArgumentException(sprintf('Unexpected logging level: %s', $level));
        }

        $this->level = $level;
    }

    /**
     * Get the current minimum logging level.
     *
     * @return int
     */
    public function getLevel() {
        return $this->level;
    }

    /**
     * Logs with an arbitrary level.
     *
     * @throws \Mustache_Exception_InvalidArgumentException if the logging level is unknown
     *
     * @param mixed  $level
     * @param string $message
     * @param array  $context
     */
    public function log($level, $message, array $context = array()) {
        if (!array_key_exists($level, self::$levels)) {
            throw new \Mustache_Exception_InvalidArgumentException(sprintf('Unexpected logging level: %s', $level));
        }

        if (stristr($message, "Template cache disabled") !== false) {
            # No need to log this; we're ignoring it for now because the template cache caused permissions issues that broke Pancakes.
            return;
        }

        if (self::$levels[$level] >= self::$levels[$this->level]) {
            $this->writeLog($level, $message, $context);
        }
    }

    /**
     * Write a record to the log.
     *
     * @throws Exception
     *
     * @param int    $level   The logging level
     * @param string $message The log message
     * @param array  $context The log context
     */
    protected function writeLog($level, $message, array $context = array()) {
        throw new Exception(self::formatLine($level, $message, $context), static::$levels[$level]);
    }

    /**
     * Gets the name of the logging level.
     *
     * @throws \InvalidArgumentException if the logging level is unknown
     *
     * @param int $level
     *
     * @return string
     */
    protected static function getLevelName($level) {
        return strtoupper($level);
    }

    /**
     * Format a log line for output.
     *
     * @param int    $level   The logging level
     * @param string $message The log message
     * @param array  $context The log context
     *
     * @return string
     */
    protected static function formatLine($level, $message, array $context = array()) {
        return sprintf(
            "%s: %s\n",
            self::getLevelName($level),
            self::interpolateMessage($message, $context)
        );
    }

    /**
     * Interpolate context values into the message placeholders.
     *
     * @param string $message
     * @param array  $context
     *
     * @return string
     */
    protected static function interpolateMessage($message, array $context = array()) {
        if (strpos($message, '{') === false) {
            return $message;
        }

        // build a replacement array with braces around the context keys
        $replace = array();
        foreach ($context as $key => $val) {
            $replace['{' . $key . '}'] = $val;
        }

        // interpolate replacement values into the the message and return
        return strtr($message, $replace);
    }
}
