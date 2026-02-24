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
 * The Mustache Context<br />Serves as a wrapper for all contexts, to throw errors when variables don't exist.
 *
 * @category Mustache
 */
class Context extends \Mustache_Context {

    /**
     * Helper function to find a variable in the Context stack.
     *
     * @see Mustache_Context::find
     *
     * @param string $id    Variable name
     * @param array  $stack Context stack
     *
     * @return mixed Variable value, or '' if not found
     */
    protected function findVariableInStack($id, array $stack) {
        for ($i = count($stack) - 1; $i >= 0; $i--) {
            $frame = &$stack[$i];

            switch (gettype($frame)) {
                case 'object':
                    if (!($frame instanceof Closure)) {
                        // Note that is_callable() *will not work here*
                        // See https://github.com/bobthecow/mustache.php/wiki/Magic-Methods
                        if (method_exists($frame, $id)) {
                            return $frame->$id();
                        }

                        if (isset($frame->$id)) {
                            return $frame->$id;
                        }

                        if ($frame instanceof ArrayAccess && isset($frame[$id])) {
                            return $frame[$id];
                        }
                    }
                    break;

                case 'array':
                    if (array_key_exists($id, $frame)) {
                        return $frame[$id];
                    }
                    break;
            }
        }

        $backtrace = debug_backtrace(!DEBUG_BACKTRACE_PROVIDE_OBJECT);
        return "{{{$backtrace[1]['args'][0]}}}";
    }

}
