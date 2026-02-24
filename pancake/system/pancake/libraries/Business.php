<?php

defined("BASEPATH") OR exit("No direct script access allowed");
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2014, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 4.1.31
 */

/**
 * The Business library.
 *
 * Handles the display of different business settings.
 *
 * @category Business Identities
 */
class Business {

    const ANY_BUSINESS = 0;

    protected static $business_details;

    public static function setBusiness($id) {
        $CI = get_instance()->load->model("settings/business_identities_m");
        self::$business_details = $CI->business_identities_m->getBusinessDetails($id);
    }

    public static function setBusinessFromClient($client_id) {
        $CI = get_instance()->load->model("settings/business_identities_m");
        $CI->load->model("clients/clients_m");
        self::setBusiness($CI->clients_m->getBusinessIdentity($client_id));
    }

    public static function getShowNameAlongWithLogo() {
        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details['show_name_along_with_logo'];
    }

    public static function getLogo($img_only = false, $anchor = true, $h = 1, $settings = null) {
        $logo = Business::getLogoUrl();
        if (isset($settings['use_business_name']) && $settings['use_business_name']) {
            $title = Business::getBusinessName();
        } else {
            $title = Business::getBrandName();
        }
        $style = [];

        if (is_array($settings)) {
            foreach ($settings as $key => $value) {
                if (!in_array($key, ["ignore_show_name", "is_email"])) {
                    if (is_numeric($value)) {
                        $value = "{$value}px";
                    }
                    $style[$key] = "$key: {$value}; ";
                }
            }
        }

        $width = null;
        $height = null;

        if (isset($settings["is_email"]) && !empty($logo)) {
            $max_width = $settings['max-width'];
            $max_height = $settings['max-height'];
            $width = self::$business_details["logo_width"];
            $height = self::$business_details["logo_height"];

            if ($width > $max_width) {
                $ratio = $width / $max_width;
                $width = $max_width;
                $height = $height / $ratio;
            }

            if ($height > $max_height) {
                $ratio = $height / $max_height;
                $height = $max_height;
                $width = $width / $ratio;
            }
        }

        $style = implode(" ", $style);

        if (!empty($style)) {
            $style = 'style="'.$style.'"';
        }

        if (empty($logo)) {
            $anchor = $anchor ? anchor('admin', $title) : $title;
            $return = $img_only ? '' : "<h" . $h . " class='logo'>" . $anchor . "</h" . $h . ">";
        } else {
            $size = "";
            if ($width || $height) {
                $size = 'width="' . $width . '" height="' . $height . '"';
            }

            $include_brand_name = (self::getShowNameAlongWithLogo() and !isset($settings['ignore_show_name']));
            $logo = "<img $size src='$logo' class='header-logo ".($include_brand_name ? "with-side-text" : "")."' $style alt='$title' />";

            if ($include_brand_name) {
                $anchor = $anchor ? anchor('admin', "$logo <span>$title</span>") : "$logo <span>$title</span>";
            } else {
                $anchor = $anchor ? anchor('admin', "$logo") : "$logo";
            }

            if ($h > 0) {
                $return = "<h" . $h . " class='logo'>" . $anchor . "</h" . $h . ">";
            } else {
                $return = $anchor;
            }
        }

        return $return;
    }

    public static function getLogoUrl() {
        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        $logo = self::$business_details['logo_filename'];

        if (!empty($logo)) {
            if (stristr($logo, "uploads/") !== false) {
                $logo = str_ireplace("uploads/", "", $logo);
            }

            # Wrap $logo around site_url() if it's a relative URL, otherwise leave as is.
            $logo = !preg_match('!^\w+://!i', $logo) ? Pancake\Filesystem\Filesystem::url($logo) : $logo;
        }

        return $logo;
    }

    public static function getBrandName() {

        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details['brand_name'];
    }

    public static function getBusiness() {
        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details;
    }

    public static function getBusinessId() {
        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details['id'];
    }

    public static function getBusinessName() {

        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details['site_name'];
    }

    public static function getAdminName() {

        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details['admin_name'];
    }

    public static function getMailingAddress() {

        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details['mailing_address'];
    }

    public static function getHtmlEscapedMailingAddress() {
        return escape(nl2br(Business::getMailingAddress()));
    }

    public static function getNotifyEmail() {

        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        $email = self::$business_details['notify_email'];

        return empty($email) ? self::$business_details['billing_email'] : $email;
    }

    public static function getBillingEmail() {

        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details['billing_email'];
    }

    public static function getNotifyEmailFrom() {

        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details['notify_email_from'];
    }

    public static function getBillingEmailFrom() {

        if (self::$business_details === null) {
            self::setBusiness(self::ANY_BUSINESS);
        }

        return self::$business_details['billing_email_from'];
    }

}
