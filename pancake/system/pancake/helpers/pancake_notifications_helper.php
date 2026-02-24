<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2011, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 3.1
 */

/**
 * Checks if a given notification was marked as "Don't show this again" by the currently logged in user.
 * 
 * Returns "hidden" if the notification is hidden, and false if not.
 * You can use if (notification_hidden($notification_id)) if you want to avoid showing the HTML for a notification completely,
 * or class="<?php echo notification_hidden($notification_id);?>" if you want it to come up as a class in your HTML, 
 * so your CSS/JS can deal with the notification appropriately.
 *  
 * @param string $notification_id
 * @return boolean|string 
 */
function notification_hidden($notification_id) {
    $CI = &get_instance();
    $user_id = (int) $CI->template->current_user->id;
    return ($CI->db->where('user_id', $user_id)->where('notification_id', $notification_id)->count_all_results('hidden_notifications') == 0) ? false : 'hidden';
}

/**
 * Marks a notification as "Don't show this again" by the currently logged in user.
 * 
 * @param string $notification_id
 * @return boolean 
 */
function hide_notification($notification_id) {
    if (!notification_hidden($notification_id)) {
	$CI = &get_instance();
	$user_id = (int) $CI->template->current_user->id;
	return $CI->db->insert('hidden_notifications', array('user_id' => $user_id, 'notification_id' => $notification_id));
    }
}