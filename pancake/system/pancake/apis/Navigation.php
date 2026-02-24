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
 * @copyright 2014 Pancake Payments
 * @license   http://pancakeapp.com/license Pancake End User License Agreement
 * @link      http://pancakeapp.com
 * @since     4.1.20
 */

namespace Pancake;

/**
 * The Navigation API<br />Allows you to add navbar links/dividers/labels.
 *
 * @category Navigation
 */
class Navigation {

    /**
     * A navbar item of type link.
     * Will be rendered as &lt;a>.
     *
     * @ignore
     */
    const TYPE_LINK = 1;

    /**
     * A navbar item of type label.
     * Will be rendered as &lt;label>.
     *
     * @ignore
     */
    const TYPE_LABEL = 2;

    /**
     * A navbar item of type divider.
     * Will be rendered as &lt;li class='divider'>&lt;/li>.
     *
     * @ignore
     */
    const TYPE_DIVIDER = 4;

    /**
     * Contains all of the links/labels/dividers currently registered in the navbar.
     * @var array
     */
    protected static $navbar = array();

    /**
     * Contains all of the quick links currently registered.
     *
     * @var array
     */
    protected static $quicklinks;

    /**
     * Contains all of the quick link generators currently registered.
     *
     * @var array
     */
    protected static $quicklinks_generators;

    /**
     * Add a new new navbar link.
     *
     * If $parent_url is specified, this link will be added in a submenu of the link with $url == $parent_url.
     *
     * @param string $url
     * @param string $title
     * @param string $parent_url
     */
    public static function registerNavbarLink($url, $title, $parent_url = null) {
        self::registerNavbarItem($url, $title, $parent_url, self::TYPE_LINK);
    }

    /**
     * Add a new new navbar label.
     *
     * If $parent_url is specified, this label will be added in a submenu of the link with $url == $parent_url.
     *
     * @link http://i.28hours.org/20140402-130106-1b36.png What a navbar label looks like
     * @param string $title
     * @param string $parent_url
     */
    public static function registerNavbarLabel($title, $parent_url) {
        self::registerNavbarItem($title, $title, $parent_url, self::TYPE_LABEL);
    }

    /**
     * Add a new new navbar divider.
     *
     * It will be added as a submenu of $parent_url.
     *
     * @link http://i.28hours.org/20140402-130239-9c04.png What a navbar divider looks like
     * @param string $parent_url
     */
    public static function registerDivider($parent_url) {
        $title = "divider-" . uniqid();
        self::registerNavbarItem($title, $title, $parent_url, self::TYPE_DIVIDER);
    }

    /**
     * Display a number or string in a badge to the right of your link.
     *
     * @link http://i.28hours.org/20140402-130421-0fc0.png What a badge looks like in the main menu
     * @link http://i.28hours.org/20140402-130409-d58b.png What a badge looks like in submenus
     * @param string $url
     * @param string $badge
     */
    public static function setBadge($url, $badge) {
        if (!isset(self::$navbar[$url])) {
            return;
        }

        self::$navbar[$url]['badge'] = $badge;
    }

    /**
     * Add a class to a link's &lt;a>.
     *
     * @param string $url
     * @param string $class
     */
    public static function setClass($url, $class) {
        if (!isset(self::$navbar[$url])) {
            return;
        }

        self::$navbar[$url]['class'] = $class;
    }

    /**
     * Add a class to a link's container &lt;li>.
     *
     * @param string $url
     * @param string $container_class
     */
    public static function setContainerClass($url, $container_class) {
        if (!isset(self::$navbar[$url])) {
            return;
        }

        self::$navbar[$url]['container_class'] = $container_class;
    }

    /**
     * Add data-* attributes to a link's container &lt;li>.
     *
     * `$data_attributes` is an array of attribute name => attribute value pairs. For example:
     *
     * `$data_attributes = array("attribute1" => "yes");`
     *
     * This will add `data-attribute1="yes"` to the specified link's container &lt;li>.
     *
     * @param string $url
     * @param array $data_attributes
     * @throws NavigationException
     */
    public static function setContainerDataAttributes($url, $data_attributes) {
        if (!isset(self::$navbar[$url])) {
            return;
        }

        if (is_array($data_attributes) or in_array('ArrayAccess', class_implements($data_attributes))) {
            self::$navbar[$url]['container_data_attributes'] = $data_attributes;
        } else {
            throw new NavigationException("Unexpected \$data_attributes type: " . gettype($data_attributes) . " (Expected: array or instanceof ArrayAccess)");
        }
    }

    public static function registerQuickLinkOwner($url, $generator = null) {
        self::$quicklinks[$url] = array();

        if ($generator !== null) {
            if (is_callable($generator)) {
                self::$quicklinks_generators[$url] = $generator;
            } else {
                throw new NavigationException("Unexpected \$generator type: " . gettype($generator) . " (Expected: callable)");
            }
        }
    }

    public static function registerQuickLink($url, $title, $parent_url, $icon = 'link', $class = null) {
        if (!isset(self::$quicklinks[$parent_url])) {
            throw new NavigationException("The page '$parent_url' does not use Quick Links, and thus no Quick Links can be registered for it.");
        }

        self::$quicklinks[$parent_url][$url] = array(
            'title' => $title,
            'icon' => $icon,
            'class' => $class,
        );
    }

    /**
     * Get a tree of navbar links, ready to be displayed.
     *
     * @return array
     * @ignore
     */
    public static function getNavbarLinks() {
        $navbar = array();

        foreach (self::$navbar as $url => $details) {
            $is_active = string_starts_with(rtrim(uri_string(), "/") . "/", rtrim($url, "/") . "/");
            Navigation::setContainerClass($url, $details['container_class'] . ($is_active ? " active" : ""));
        }

        $self_navbar = self::$navbar;

        $process_children = function($details) use (&$process_children, $self_navbar) {
            if (count($details['children']) > 0) {
                $children = array();
                foreach ($details['children'] as $child) {
                    $child_details = $self_navbar[$child];
                    $child_details['children'] = $process_children($child_details);
                    $children[$child] = $child_details;
                }
                return $children;
            } else {
                return array();
            }
        };

        foreach ($self_navbar as $url => $details) {
            if ($details['parent_url'] === null) {
                $details['children'] = $process_children($details);
                $navbar[$url] = $details;
            }
        }

        return $navbar;
    }

    public static function getQuickLinks($parent_url, $data = []) {
        if (!isset(self::$quicklinks[$parent_url])) {
            throw new NavigationException("The page '$parent_url' does not use Quick Links, and thus it is impossible to get Quick Links for it.");
        }

        if (isset(self::$quicklinks_generators[$parent_url])) {
            self::$quicklinks[$parent_url] = [];
            call_user_func(self::$quicklinks_generators[$parent_url], $data);
        }

        return self::$quicklinks[$parent_url];
    }

    /**
     * Register a navbar item (of any kind).
     *
     * @param string $url
     * @param string $title
     * @param string $parent_url
     * @param (one of the TYPE_* constants) $type
     * @ignore
     */
    protected static function registerNavbarItem($url, $title, $parent_url, $type) {
        if ($parent_url !== null and ! isset(self::$navbar[$parent_url])) {
            return;
        }

        self::$navbar[$url] = array(
            'title' => $title,
            'children' => array(),
            'parent_url' => $parent_url,
            'badge' => null,
            'class' => null,
            'container_class' => null,
            'type' => $type,
            'container_data_attributes' => array(),
        );

        if ($parent_url !== null) {
            self::$navbar[$parent_url]['children'][] = $url;
        }
    }

}
