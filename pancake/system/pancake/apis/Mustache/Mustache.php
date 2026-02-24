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
 * The Mustache API<br />Allows you to use Mustache templates and automatically handles missing variable errors.
 *
 * @category Mustache
 */
class Mustache {

    /**
     * The Mustache instance.
     *
     * @var \Mustache_Engine
     */
    protected $mustache;

    function __construct() {
        $this->mustache = new \Mustache_Engine(array(
            "strict_callables" => true,
            "logger" => new \Pancake\Mustache\Logger(\Pancake\Mustache\Logger::WARNING),
        ));

        if (IS_DEBUGGING) {
            $foo = new \ReflectionMethod('Mustache_Context', 'findVariableInStack');
            if (in_array("private", \Reflection::getModifierNames($foo->getModifiers()))) {
                throw new Exception("The 'findVariableInStack' method of Mustache_Context is private and shouldn't be!");
            }
        }
    }

    /**
     * Shortcut 'render' invocation.
     *
     * @param string $template
     * @param mixed  $context (default: array())
     *
     * @return string Rendered template
     */
    public function render($template, $context = array()) {
        $stack = new Context();

        $helpers = $this->mustache->getHelpers();
        if (!$helpers->isEmpty()) {
            $stack->push($helpers);
        }

        if (!empty($context)) {
            $stack->push($context);
        }

        return @$this->mustache->loadTemplate($template)->renderInternal($stack);
    }

}
