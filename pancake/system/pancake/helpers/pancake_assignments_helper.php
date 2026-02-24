<?php

/**
 * Adds a clause to any query that limits the results to items to which the user is assigned.
 *
 * @param string|array $item_type
 * @param string|array $action
 */
function where_assigned($item_type, $action, $field = 'id', $table = null) {
    if (logged_in() and !is_admin()) {
        $CI = &get_instance();
        $CI->load->model('users/assignments');
        $ids = $CI->assignments->get_assigned_ids($item_type, $action);
        if ($ids !== null) {
            $item_type = $CI->assignments->_map_item_type_table($item_type);

            if ($table === null) {
                $table = $item_type;
            }

            if (count($ids) > 0) {
                
                if ($item_type == "project_tasks") {
                    $ids[] = "0";
                }

                # Ticket #47555 - preg_match(): Compilation failed: regular expression is too large at offset 33298
                # To avoid this, we split the where_in ourselves:
                $CI->db->group_start();
                $id_chunks = array_chunk($ids, 100);
                foreach ($id_chunks as $id_chunk) {
                    $CI->db->or_where_in($table . '.' . $field, $id_chunk);
                }
                $CI->db->group_end();
            } else {
                $CI->db->where($table . '.' . $field, '');
            }
        }
    }
}

/**
 * Gets an array of IDs of $item_type for which the user is allowed to $action.
 *
 * Takes into account client permissions and overrides.
 *
 * @param string|array $item_type
 * @param string|array $action
 * @return array array with allowed ids.
 */
function get_assigned_ids($item_type, $action) {
    $CI = &get_instance();
    $CI->load->model('users/assignments');
    return $CI->assignments->get_assigned_ids($item_type, $action);
}

/**
 * Checks if a user is allowed to perform $action for an $item_type belonging to $client_id.
 *
 * If $action is not 'create' or 'generate_from_project', $item_id must be specified, or
 * an exception is thrown.
 *
 * @param string|array $action
 * @param integer $client_id
 * @param string|array $item_type
 * @param integer $item_id
 * @return boolean
 */
function can($action, $client_id, $item_type, $item_id = null) {
    $CI = &get_instance();
    $CI->load->model('users/assignments');
    return $CI->assignments->can($action, $client_id, $item_type, $item_id);
}

/**
 * Checks if a user is allowed to perform $action for $item_type for any client.
 *
 * Useful if, for example, you want a user to see access_denied() instead of the "create" page,
 * if they can't create $item_type for anyone.
 *
 * @param string|array $action
 * @param string|array $item_type
 * @return boolean
 */
function can_for_any_client($action, $item_type) {
    $CI = &get_instance();
    $CI->load->model('users/assignments');

    if (is_admin()) {
        # Always true if it's an admin.
        return true;
    }

    return count($CI->assignments->get_clients_involved($item_type, $action)) > 0;
}

/**
 * Loads a view with a permission control.
 *
 * Prepopulates with existing data, either from DB or form.
 *
 * @param string $item_type
 * @param integer $item_id
 */
function assignments($item_type, $item_id = 0, $label_columns = "two") {

    if (is_array($item_type)) {
        throw new Exception("The User Permissions system does not support arrays for the assignments() function.");
    }

    if ($item_id === "") {
        $item_id = 0;
    }

    if (is_admin()) {

        $CI = &get_instance();
        $CI->load->model('users/user_m');
        $CI->load->model('users/assignments');

        $available_item_types = $CI->assignments->_available_item_types();

        if (!in_array($item_type, $available_item_types)) {
            throw new Exception("The User Permissions system does not support '$item_type'. Please contact bruno@terraduo.com for the documentation to the User Permissions system if you don't have it. Otherwise, refer to it for adding new item types.");
        }

        $post = $CI->assignments->postdata;
        $users = $CI->user_m->get_users_list(false);
        $existing_breakdown = array();

        unset($users[$CI->current_user->id]);

        if (count($users) == 0) {
            # Do not load anything because no permissions are necessary;
            # the only users that exist are admins.
            return;
        }

        if (count($post) == 0) {
            $existing = $CI->assignments->get_assignments($item_type, $item_id);

            $client_id = $CI->assignments->_get_client($item_type, $item_id);
            $existing_breakdown_buffer = $CI->assignments->get_breakdown($client_id);

            if ($item_id != 0 and $item_type != 'clients') {
                $table = $CI->db->dbprefix($CI->assignments->_map_item_type_table($item_type));
                $owner_id = $CI->db->query("select owner_id from $table where id = ".$CI->db->escape($item_id))->row_array();
                $owner_id = array_reset($owner_id);

                foreach (array_keys($users) as $user_id) {
                    if (!isset($existing[$user_id])) {
                        # Get inherited permissions, if there is an item id.

                        if(isset($existing_breakdown_buffer[$user_id]) && isset($existing_breakdown_buffer[$user_id][$item_type])){
                            $can_all = $existing_breakdown_buffer[$user_id][$item_type][0];

                            if (!$can_all) {
                                # Check if the user owns this item.
                                if ($owner_id != $user_id) {
                                    # The user does not own this item, do not apply permissions.
                                    continue;
                                }
                            }

                            $a = $existing_breakdown_buffer[$user_id][$item_type];
                            $existing[$user_id] = $a[2] . $a[3] . $a[4] . $a[6] . $a[5];
                        }
                    }
                }
            }

            if ($item_type == 'clients' and $item_id != 0) {
                $existing_breakdown = $existing_breakdown_buffer;
            }
        } else {
            $existing = $post['permission_levels'];
            if ($item_type == 'clients' and $item_id != 0) {
                $existing_breakdown = $post['breakdown'];
            }
        }

        unset($available_item_types['clients']);

        $CI->load->view('users/assignments', array(
            'label_columns' => $label_columns,
            'item_type' => $item_type,
            'item_id' => $item_id,
            'users' => $users,
            'existing_breakdown' => $existing_breakdown,
            'existing_permission_levels' => $existing,
            'available_item_types' => $available_item_types
        ));
    }
}

/**
 * Gets the array for a client dropdown, taking into account User Permissions.
 *
 * $count_type is the argument used in get_count(). If provided, a count of $count_type will be appended to the client's name.
 *
 * $empty_label and $empty_value should be self-explanatory.
 *
 * @param string|array $item_type
 * @param string|array $action
 * @param string $count_type
 * @param string $empty_label
 * @param string|integer $empty_value
 * @return array
 */
function client_dropdown($item_type, $action, $count_type = '', $empty_label = null, $empty_value = '') {
    $CI = get_instance();
    $CI->load->model('clients/clients_m');
    $CI->load->model('users/assignments');
    return $CI->clients_m->build_permitted_clients_dropdown($item_type, $action, $count_type, $empty_label, $empty_value);
}

/**
 * Get the client ID of any item supported by the User Permissions system.
 *
 * @param string|array $item_type
 * @param integer $item_id
 * @return integer
 */
function get_client($item_type, $item_id) {
    $CI = get_instance();
    $CI->load->model('users/assignments');
    return $CI->assignments->_get_client($item_type, $item_id);
}