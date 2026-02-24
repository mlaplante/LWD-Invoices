<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package             Pancake
 * @author              Pancake Dev Team
 * @copyright           Copyright (c) 2012, Pancake Payments
 * @license             http://pancakeapp.com/license
 * @link                http://pancakeapp.com
 * @since               Version 4.0
 */
// ------------------------------------------------------------------------

/**
 * The Assignments Model
 *
 * @subpackage    Models
 * @category      Users
 */
class Assignments extends Pancake_Model {

    public $postdata = array();

    function _can_be_generated($item_type) {
        $generatable_item_types = array(
            'projects',
        );
        return in_array($item_type, $generatable_item_types);
    }

    function _action($action) {
        if (is_string($action)) {
            switch ($action) {
                case 'edit':
                    return 'update';
                case 'view':
                    return 'read';
                case 'insert':
                case 'add':
                    return 'create';
                default:
                    return $action;
            }
        } else {
            foreach ($action as $key => $single_action) {
                $action[$key] = $this->_action($single_action);
            }
            return $action;
        }
    }

    function _get_client($item_type, $item_id) {
        $CI = get_instance();

        if ($item_type == 'project_expenses') {
            $CI->load->model('expenses/expenses_m');
            return $CI->expenses_m->getClientIdById($item_id);
        } elseif ($item_type == 'project_tasks') {
            $CI->load->model('projects/project_task_m');
            return $CI->project_task_m->getClientIdById($item_id);
        } elseif ($item_type == 'clients') {
            $this->db->where('id', $item_id);
            $buffer = $this->db->select('id')->get('clients')->row_array();
            return ($buffer && count($buffer) > 0) ? $buffer['id'] : false;
        } else {
            $this->db->where('id', $item_id);
            $this->_limit_by_item_type($item_type);
            $buffer = $this->db->select('client_id')->get($this->_map_item_type_table($item_type))->row_array();
            return ($buffer && count($buffer) > 0) ? $buffer['client_id'] : false;
        }
    }

    function _can_be_sent($item_type) {
        $sendable_item_types = array(
            'invoices',
            'estimates',
            'proposals',
        );
        return in_array($item_type, $sendable_item_types);
    }

    /**
     * Get assignments for a particular item.
     *
     * @param string         $item_type
     * @param string|integer $item_id
     */
    function get_assignments($item_type, $item_id) {
        $buffer = $this->db->select('user_id, CONCAT(can_read, can_update, can_delete, can_send, can_generate_from_project) as permission_level', false)->where(array('item_type' => $item_type, 'item_id' => $item_id))->get('assignments')->result_array();
        $results = array();
        foreach ($buffer as $row) {
            $results[$row['user_id']] = $row['permission_level'];
        }

        if ($item_type == "project_tasks" && $item_id > 0) {
            $row = $this->db->select("assigned_user_id")->where('id', $item_id)->get('project_tasks')->row_array();
            if (!isset($results[$row['assigned_user_id']])) {
                $results[$row['assigned_user_id']] = "00000";
            }

            # Can read, but leave the other permissions as they are. See the above concat().
            $results[$row['assigned_user_id']][0] = "1";
        }

        return $results;
    }

    /**
     * Gets the client IDs of all the $item_type for which the user is allowed to $action.
     * Great to get a list of all clients that the user should be allowed to see.
     *
     * @param string $item_type
     * @param string $action
     */
    function get_clients_involved($item_type, $action) {

        $action = $this->_action($action);

        if (is_array($item_type)) {
            $return = array();
            foreach ($item_type as $single_item_type) {
                // Merge but preserve keys.
                $return += $this->get_clients_involved($single_item_type, $action);
            }
            return $return;
        }

        if ($item_type == 'estimates_plus_invoices') {
            return array_merge($this->get_clients_involved('estimates', $action), $this->get_clients_involved('invoices', $action));
        }

        if ($action == 'create_plus_update') {
            return array_merge($this->get_clients_involved($item_type, 'create'), $this->get_clients_involved($item_type, 'update'));
        }

        if ($action == 'create_plus_update_and_generate') {
            $data = array();
            if ($item_type == 'invoices' or $item_type == 'estimates') {
                $data = $this->get_clients_involved('projects', 'generate_from_project');
            }
            return array_merge($data, $this->get_clients_involved($item_type, 'create'), $this->get_clients_involved($item_type, 'update'));
        }

        $client_ids = array();

        if (!is_admin()) {
            switch ($action) {
                case 'create':
                case 'generate_from_project':
                    return $this->get_allowed($item_type, $action);
                default:
                    $assigned_ids = $this->get_assigned_ids($item_type, $action);

                    if (count($assigned_ids) == 0) {
                        return array();
                    }

                    if ($item_type == 'project_expenses') {
                        # Get by project_id or invoice_id.

                        $this->db->where_in('id', $assigned_ids);
                        $buffer = $this->db->select('project_id, invoice_id')->get($this->_map_item_type_table($item_type))->result_array();
                        $project_buffer = array();
                        $invoice_buffer = array();
                        foreach ($buffer as $row) {
                            $project_buffer[(int) $row['project_id']] = (int) $row['project_id'];
                            $invoice_buffer[(int) $row['invoice_id']] = (int) $row['invoice_id'];
                        }

                        if (isset($project_buffer[0])) {
                            unset($project_buffer[0]);
                        }

                        if (isset($invoice_buffer[0])) {
                            unset($invoice_buffer[0]);
                        }

                        if (!empty($project_buffer)) {
                            $this->db->where_in('id', $project_buffer);
                        }
                        $buffer = $this->db->select('client_id')->get('projects')->result_array();
                        foreach ($buffer as $row) {
                            $client_ids[$row['client_id']] = $row['client_id'];
                        }

                        if (!empty($invoice_buffer)) {
                            $this->db->where_in('id', $invoice_buffer);
                        }
                        $buffer = $this->db->select('client_id')->get('invoices')->result_array();
                        foreach ($buffer as $row) {
                            $client_ids[$row['client_id']] = $row['client_id'];
                        }
                    } elseif ($item_type == 'project_tasks') {
                        # Get by project_id. So get projects first.

                        # Ticket #47555 - preg_match(): Compilation failed: regular expression is too large at offset 33298
                        # To avoid this, we split the where_in ourselves:
                        $this->db->group_start();
                        $assigned_ids_chunks = array_chunk($assigned_ids, 100);
                        foreach ($assigned_ids_chunks as $assigned_ids_chunk) {
                            $this->db->or_where_in('id', $assigned_ids_chunk);
                        }
                        $this->db->group_end();

                        $buffer = $this->db->select('project_id')->get($this->_map_item_type_table($item_type))->result_array();
                        $project_buffer = array();
                        foreach ($buffer as $row) {
                            $project_buffer[$row['project_id']] = $row['project_id'];
                        }

                        if (count($project_buffer) > 0) {
                            $this->db->where_in('id', $project_buffer);
                            $buffer = $this->db->select('client_id')->get('projects')->result_array();
                            foreach ($buffer as $row) {
                                $client_ids[$row['client_id']] = $row['client_id'];
                            }
                        }
                    } elseif ($item_type == 'clients') {
                        foreach ($assigned_ids as $client_id) {
                            $client_ids[$client_id] = $client_id;
                        }
                    } else {
                        $this->db->where_in('id', $assigned_ids);
                        $this->_limit_by_item_type($item_type);
                        $buffer = $this->db->select('client_id')->get($this->_map_item_type_table($item_type))->result_array();
                        foreach ($buffer as $row) {
                            $client_ids[$row['client_id']] = $row['client_id'];
                        }
                    }
            }
        } else {
            # Is an admin, and can touch all clients.
            $buffer = $this->db->select('id')->get('clients')->result_array();
            foreach ($buffer as $row) {
                $client_ids[$row['id']] = $row['id'];
            }
        }

        return $client_ids;
    }

    /**
     * This function is here for reference.
     * It lists all the item types that the User Permissions system officially supports.
     *
     * @return array
     */
    function _available_item_types() {
        return array(
            'clients' => 'clients',
            'estimates' => 'estimates',
            'project_expenses' => 'project_expenses',
            'invoices' => 'invoices',
            'projects' => 'projects',
            'project_tasks' => 'project_tasks',
            'proposals' => 'proposals',
            'tickets' => 'tickets',
        );
    }

    function get_tree($item_type, $user_id = null) {
        $admin_group = $this->db->escape($this->config->item('admin_group', 'ion_auth'));
        $admin_group = $this->db->query("select id from `" . $this->db->dbprefix("groups") . "` where name = $admin_group")->row_array();
        $admin_group = $admin_group['id'];

        $admins_buffer = $this->db->query("select id from `" . $this->db->dbprefix("users") . "` where group_id = $admin_group")->result_array();
        $admins = array();
        foreach ($admins_buffer as $admin) {
            $admins[$admin['id']] = (int) $admin['id'];
        }

        $where = $this->_limit_by_item_type($item_type, true);
        $where = empty($where) ? '' : 'where ' . $where;
        $table = $this->db->dbprefix($this->_map_item_type_table($item_type));
        $join = "";

        if ($item_type == "clients") {
            $select = "`$table`.id, `$table`.id as client_id, `$table`.owner_id";
        } elseif ($item_type == "project_tasks") {
            $select = "`$table`.id, client_id, `$table`.owner_id";
            $join = "join `" . $this->db->dbprefix("projects") . "` on `" . $this->db->dbprefix("projects") . "`.id = project_id";
        } else {
            $select = "`$table`.id, client_id, `$table`.owner_id";
        }

        $buffer = $this->db->query("select $select from $table $join $where")->result_array();
        $tree = array();

        $client_mapping = array();
        $owner_mapping = array();

        foreach ($buffer as $row) {
            if (!isset($client_mapping[$row['client_id']])) {
                $client_mapping[$row['client_id']] = array();
            }

            if (!isset($owner_mapping[$row['owner_id']])) {
                $owner_mapping[$row['owner_id']] = array();
            }

            $owner_mapping[$row['id']][$row['owner_id']] = $row['owner_id'];
            $client_mapping[$row['client_id']][$row['id']] = $row['id'];

            $permission = $user_id ? isset($admins[$user_id]) : $admins;

            $tree[$row['id']] = array(
                'can_read' => $permission,
                'can_update' => $permission,
                'can_delete' => $permission,
                'can_generate_from_project' => $permission,
                'can_send' => $permission,
            );
        }

        if ($user_id === null || isset($admins[$user_id])) {
            # No need to go through assignments; this is for an admin and everything's allowed.
            return $tree;
        }

        $user_id_sql = $user_id ? " and user_id = " . $this->db->escape($user_id) : "";
        $assignments = $this->db->query("select * from `" . $this->db->dbprefix("assignments") . "` where item_type = " . $this->db->escape($item_type) . $user_id_sql)->result_array();
        $assignment_permissions = $this->db->query("select * from `" . $this->db->dbprefix("assignments_permissions") . "` where item_type = " . $this->db->escape($item_type) . $user_id_sql)->result_array();

        $deal_with_assignment = function ($user_id, $assignment, $item_id, $override_permissions = true) use (&$tree) {
            $item = &$tree[$item_id];

            if ($user_id) {
                $item['can_read'] = ((bool) $assignment['can_read']) || (!$override_permissions && $item['can_read']);
                $item['can_update'] = ((bool) $assignment['can_update']) || (!$override_permissions && $item['can_update']);
                $item['can_delete'] = ((bool) $assignment['can_delete']) || (!$override_permissions && $item['can_delete']);
                $item['can_generate_from_project'] = ((bool) $assignment['can_generate_from_project']) || (!$override_permissions && $item['can_generate_from_project']);
                $item['can_send'] = ((bool) $assignment['can_send']) || (!$override_permissions && $item['can_generate_from_project']);

                if (!$item['can_read']) {
                    unset($tree[$item_id]);
                }
            } else {
                if ($assignment['can_read']) {
                    $item['can_read'][$assignment['user_id']] = $assignment['user_id'];
                }

                if ($assignment['can_update']) {
                    $item['can_update'][$assignment['user_id']] = $assignment['user_id'];
                }

                if ($assignment['can_delete']) {
                    $item['can_delete'][$assignment['user_id']] = $assignment['user_id'];
                }

                if ($assignment['can_generate_from_project']) {
                    $item['can_generate_from_project'][$assignment['user_id']] = $assignment['user_id'];
                }

                if ($assignment['can_send']) {
                    $item['can_send'][$assignment['user_id']] = $assignment['user_id'];
                }
            }
        };

        foreach ($assignments as $assignment) {
            if (isset($tree[$assignment['item_id']])) {
                $assignment['user_id'] = (int) $assignment['user_id'];
                $deal_with_assignment($user_id, $assignment, $assignment['item_id']);
            }
        }

        foreach ($assignment_permissions as $permission) {
            if (isset($client_mapping[$permission['client_id']])) {
                $permission['user_id'] = (int) $permission['user_id'];

                foreach ($client_mapping[$permission['client_id']] as $item_id) {
                    if ($user_id) {
                        if (!isset($tree[$item_id]["can_read"]) || !$tree[$item_id]["can_read"]) {
                            # The user doesn't have explicit permission to read.
                            # Therefore, we can ignore this item; the permission is only for items the user owns, and this is not one of them.
                            unset($tree[$item_id]);
                            continue;
                        }
                    } else {
                        if (!isset($tree[$item_id]["can_read"][$permission['user_id']]) || !$tree[$item_id]["can_read"][$permission['user_id']]) {
                            # The user doesn't have explicit permission to read.
                            # Therefore, we can ignore this item; the permission is only for items the user owns, and this is not one of them.
                            foreach (array_keys($tree[$item_id]) as $permission) {
                                unset($tree[$item_id][$permission][$permission['user_id']]);
                                continue;
                            }
                        }
                    }

                    # Here, we only want to -expand- the current permissions, never shrink them.
                    # So if the user already has read access to something, they will retain it.
                    # The per-client permissions never override the per-item permissions.
                    $deal_with_assignment($user_id, $permission, $item_id, false);
                }
            }
        }

        if ($user_id) {
            foreach ($tree as $item_id => $item) {
                if (!$item['can_read']) {
                    unset($tree[$item_id]);
                }
            }
        }

        return $tree;
    }

    /**
     * Gets an array of IDs of $item_type for which the user is allowed to $action.
     * Takes into account client permissions and overrides.
     *
     * @param string $item_type
     * @param string $action
     *
     * @return array array with allowed ids.
     */
    function get_assigned_ids($item_type, $action) {

        $action = $this->_action($action);

        $CI = &get_instance();
        if (!is_admin()) {
            # User is not an admin, so his or her access needs to be limited.
            if ($CI->current_user) {

                $user_id = $CI->current_user->id;
                $allowed_clients = array();
                $allowed_items = array();

                if (is_string($item_type)) {
                    if ($item_type == 'estimates_plus_invoices') {
                        return array_merge($this->get_assigned_ids('estimates', $action), $this->get_assigned_ids('invoices', $action));
                    } else {
                        $array_item_type = array("'$item_type'");
                    }
                }

                # Cannot use ActiveRecord because this function might be used in the middle of a select query.
                $buffer = $this->db->query("select client_id, can_all from " . $this->db->dbprefix("assignments_permissions") . " where user_id = $user_id and can_$action = 1 and item_type in (" . implode(',', $array_item_type) . ")")->result_array();

                foreach ($buffer as $row) {
                    $allowed_clients[$row['client_id']] = $row['can_all'];
                }

                if (count($allowed_clients) > 0) {
                    # Get all items that the user is, by default, allowed to $action:
                    if ($item_type == 'project_expenses') {
                        # Get by project_id or invoice_id.
                        $allowed_project_ids = $this->get_assigned_ids('projects', 'read');
                        $allowed_invoice_ids = $this->get_assigned_ids('invoices', 'read');
                        if (count($allowed_project_ids) == 0 || count($allowed_invoice_ids) == 0) {
                            return array();
                        }

                        $project_expenses_table = $this->db->dbprefix($this->_map_item_type_table($item_type));
                        $projects_table = $this->db->dbprefix($this->_map_item_type_table("projects"));
                        $buffer = $this->db->query("select $project_expenses_table.id, $project_expenses_table.owner_id, client_id from $project_expenses_table left join $projects_table on $projects_table.id in (" . implode(',', $allowed_project_ids) . ") ")->result_array();

                        foreach ($buffer as $row) {
                            if (isset($allowed_clients[$row['client_id']])) {
                                if ($allowed_clients[$row['client_id']] == 0) {
                                    # Only allow own.
                                    if ($row['owner_id'] == $user_id) {
                                        $allowed_items[$row['id']] = $row['id'];
                                    }
                                } else {
                                    $allowed_items[$row['id']] = $row['id'];
                                }
                            }
                        }
                    } elseif ($item_type == 'project_tasks') {
                        # Get by project_id. So get projects first.
                        $allowed_project_ids = $this->get_assigned_ids('projects', 'read');
                        if (count($allowed_project_ids) == 0) {
                            return array();
                        }

                        $where = $this->_limit_by_item_type($item_type, true);
                        $where = empty($where) ? '' : 'where ' . $where;
                        $project_tasks_table = $this->db->dbprefix($this->_map_item_type_table($item_type));
                        $projects_table = $this->db->dbprefix($this->_map_item_type_table("projects"));
                        $buffer = $this->db->query("select $project_tasks_table.id, $project_tasks_table.owner_id, client_id from $project_tasks_table left join $projects_table on $projects_table.id in (" . implode(',', $allowed_project_ids) . ") $where")->result_array();

                        foreach ($buffer as $row) {
                            if (isset($allowed_clients[$row['client_id']])) {
                                if ($allowed_clients[$row['client_id']] == 0) {
                                    # Only allow own.
                                    if ($row['owner_id'] == $user_id) {
                                        $allowed_items[$row['id']] = $row['id'];
                                    }
                                } else {
                                    $allowed_items[$row['id']] = $row['id'];
                                }
                            }
                        }
                    } else {
                        # Get by client_id.
                        $where = $this->_limit_by_item_type($item_type, true);
                        $where = empty($where) ? '' : 'and ' . $where;
                        $table = $this->db->dbprefix($this->_map_item_type_table($item_type));
                        $buffer = $this->db->query("select id, owner_id, client_id from $table where client_id in (" . implode(',', array_keys($allowed_clients)) . ") $where")->result_array();

                        foreach ($buffer as $row) {
                            if ($allowed_clients[$row['client_id']] == 0) {
                                # Only allow own.
                                if ($row['owner_id'] == $user_id) {
                                    $allowed_items[$row['id']] = $row['id'];
                                }
                            } else {
                                $allowed_items[$row['id']] = $row['id'];
                            }
                        }
                    }
                }

                # Get all items with overrides:

                $buffer = $this->db->query("select item_id, can_$action from " . $this->db->dbprefix("assignments") . " where user_id = $user_id and item_type in (" . implode(',', $array_item_type) . ")")->result_array();
                foreach ($buffer as $row) {
                    if ($row['can_' . $action] == 0) {
                        # User is explicitely disallowed from touching this item.
                        unset($allowed_items[$row['item_id']]);
                    } else {
                        # User is allowed. If already set, nbd. Otherwise, add to list of things.
                        if (!isset($allowed_items[$row['item_id']])) {
                            $allowed_items[$row['item_id']] = $row['item_id'];
                        }
                    }
                }

                if ($item_type == 'tickets') {
                    $buffer = $this->db->query("select id from " . $this->db->dbprefix("tickets") . " where assigned_user_id = $user_id")->result_array();
                    foreach ($buffer as $row) {
                        $allowed_items[$row['id']] = $row['id'];
                    }
                }

                if ($item_type == 'projects' and $action == 'read') {
                    # Include projects with assigned tasks.
                    $buffer = $this->db->query("select project_id from " . $this->db->dbprefix("project_tasks") . " where assigned_user_id = $user_id")->result_array();
                    foreach ($buffer as $row) {
                        $allowed_items[$row['project_id']] = $row['project_id'];
                    }
                }

                if ($item_type == 'project_tasks' and $action == 'read') {
                    # Include assigned tasks.
                    $buffer = $this->db->query("select id from " . $this->db->dbprefix("project_tasks") . " where assigned_user_id = $user_id")->result_array();
                    foreach ($buffer as $row) {
                        $allowed_items[$row['id']] = $row['id'];
                    }
                }

                # Now for the big finale: Returning all allowed IDs.
                return $allowed_items;
            }
        }

        # All IDs are allowed because user is either admin or not logged in.
        $where = $this->_limit_by_item_type($item_type, true);
        $where = empty($where) ? '' : 'where ' . $where;
        $table = $this->db->dbprefix($this->_map_item_type_table($item_type));
        $buffer = $this->db->query("select id from $table $where")->result_array();
        $return = array();
        foreach ($buffer as $row) {
            $return[$row['id']] = $row['id'];
        }

        return $return;
    }

    /**
     * Limits the results of a query to those of a certain item type.
     * Used internally.
     *
     * @param string $item_type
     */
    function _limit_by_item_type($item_type, $return_sql = false) {
        switch ($item_type) {
            case 'estimates':
                if ($return_sql) {
                    return "type = 'ESTIMATE'";
                } else {
                    $this->db->where('type', 'ESTIMATE');
                }
                break;
            case 'invoices':
                if ($return_sql) {
                    return "type != 'ESTIMATE'";
                } else {
                    $this->db->where('type !=', 'ESTIMATE');
                }
                break;
        }
    }

    function _map_item_type_table($item_type) {
        switch ($item_type) {
            case 'estimates':
            case 'estimates_plus_invoices':
                return 'invoices';
                break;
        }

        return $item_type;
    }

    /**
     * Get an array of client IDs for which the user is allowed to $action for $item_type.
     *
     * @param string $item_type
     * @param string $action
     *
     * @return array
     */
    function get_allowed($item_type, $action) {

        $action = $this->_action($action);

        $client_ids = array();
        if (!is_admin()) {
            $CI = &get_instance();
            # User is not an admin, so his or her access needs to be limited.
            if ($CI->current_user) {
                $this->db->where('user_id', $CI->current_user->id);
                $this->db->where('item_type', $item_type);
                $this->db->where('can_' . $action, 1);
                $buffer = $this->db->select('client_id')->get('assignments_permissions')->result_array();

                foreach ($buffer as $row) {
                    $client_ids[$row['client_id']] = $row['client_id'];
                }
            }
        } else {
            # All IDs are allowed because user is either admin or not logged in.
            $buffer = $this->db->select('id')->get('clients')->result_array();
            foreach ($buffer as $row) {
                $client_ids[$row['id']] = $row['id'];
            }
        }

        return $client_ids;
    }

    function _inserted_record($table, $insert_id) {
        $post = $this->postdata;
        if (isset($post['item_type'])) {
            if ($post['item_type'] == $table) {
                if (empty($post['item_id'])) {
                    $post['item_id'] = $insert_id;
                    $this->set($post['item_type'], $post['item_id'], $post['permission_levels']);

                    if ($table == 'clients') {
                        $this->process_clients_permissions($insert_id);
                    }
                }
            }
        }
    }

    /**
     * Checks if a user is allowed to perform $action for an $item_type belonging to $client_id.
     * If $action is not 'create' or 'generate_from_project', $item_id must be specified, or
     * an exception is thrown.
     *
     * @param string  $action
     * @param integer $client_id
     * @param string  $item_type
     * @param integer $item_id
     *
     * @return boolean
     */
    function can($action, $client_id, $item_type, $item_id = null) {

        $action = $this->_action($action);

        if (!logged_in()) {
            # Do not allow edit or send.
            if ($action == 'update' or $action == 'send') {
                return false;
            }
        }

        if (!is_admin()) {
            switch ($action) {
                case 'create':
                case 'generate_from_project':
                    $clients_allowed = $this->get_allowed($item_type, $action);
                    if (!in_array($client_id, $clients_allowed)) {
                        # User is not allowed to create or generate an $item_type for this client.
                        return false;
                    }
                    break;
                default:
                    if ($item_id === null) {
                        throw new Exception("\$item_id must be provided when trying to find out if the user can $action a(n) $item_type for Client #$client_id.");
                    }

                    return in_array($item_id, $this->get_assigned_ids($item_type, $action));
            }
        }

        # Has not returned false yet.
        # So, sure. The user is allowed.
        return true;
    }

    /**
     * Get information stored about a client, for prepopulating the "Edit Client" section.
     *
     * @param integer $client_id
     *
     * @return array
     */
    function get_breakdown($client_id) {
        $buffer = $this->db->where(array(
            'client_id' => $client_id,
        ))->get('assignments_permissions')->result_array();
        $existing = array();

        foreach ($buffer as $row) {

            if (!isset($existing[$row['user_id']])) {
                $existing[$row['user_id']] = array();
            }

            $permission_level = $row['can_all'] . $row['can_create'] . $row['can_read'] . $row['can_update'] . $row['can_delete'] . $row['can_generate_from_project'] . $row['can_send'];

            $existing[$row['user_id']][$row['item_type']] = $permission_level;
        }

        return $existing;
    }

    /**
     * Store information about the data the user is allowed to access for a particular client.
     *
     * @param integer $client_id
     */
    function process_clients_permissions($client_id) {

        $allowed_users = $this->get_assignments('clients', $client_id);

        /**
         * Reference:
         * Permissions are in binary, akin to the CHMOD system.
         * The bits are acrudgs:
         * a - Whether the use can view all the items or just his or her own.
         * c - Whether the user can create records or not.
         * r - Whether the user can veiw records or not.
         * u - Whether the user can edit records or not.
         * d - Whether the user can delete records or not.
         * g - Whether the user can generate records from a project or not.
         * s - Whether the user can send records or not.
         */
        foreach ($this->postdata['breakdown'] as $user_id => $item_types) {

            if (!isset($allowed_users[$user_id])) {
                # User has not been assigned to this client; ignore whatever breakdown data was sent.
                $this->db->where(array(
                    'user_id' => $user_id,
                    'client_id' => $client_id,
                ))->delete('assignments_permissions');
                continue;
            }

            $buffer = $this->db->where(array(
                'user_id' => $user_id,
                'client_id' => $client_id,
            ))->get('assignments_permissions')->result_array();
            $existing = array();

            foreach ($buffer as $row) {
                $existing[$row['item_type']] = true;
            }

            foreach ($item_types as $item_type => $permission_level) {

                $permission_level = str_split(str_pad($permission_level, 7, 0, STR_PAD_RIGHT), 1);

                $data = array(
                    'user_id' => $user_id,
                    'item_type' => $item_type,
                    'client_id' => $client_id,
                    'can_all' => $permission_level[0],
                    'can_create' => $permission_level[1],
                    'can_read' => $permission_level[2],
                    'can_update' => $permission_level[3],
                    'can_delete' => $permission_level[4],
                    'can_generate_from_project' => $permission_level[5],
                    'can_send' => $permission_level[6],
                );

                if (isset($existing[$item_type])) {
                    $this->db->where(array(
                        'user_id' => $user_id,
                        'client_id' => $client_id,
                        'item_type' => $item_type,
                    ))->update('assignments_permissions', $data);
                } else {
                    $data['item_id'] = 0;
                    $this->db->insert('assignments_permissions', $data);
                }
            }
        }
    }

    function _notify_insert_id($table, $insert_id) {
        $this->assignments->_inserted_record($table, $insert_id);
    }

    /**
     * Magic method, called by Admin_Controller to automatically process input.
     * This way, assignments($item_type, $item_id); is really all it takes to
     * integrate assignments in any data.
     */
    function process_assign_postdata() {
        if (!method_exists($this->db, 'onInsert')) {
            throw new Exception("The database driver has been modified and it no longer contains the onInsert changes that Bruno added (it involved changing some existing methods as well). Talk to him, he'll help you!");
        }

        if (isset($_POST['pancake_assignment_data'])) {
            # This callback is executed when a record is created.
            $this->db->onInsert(array($this, '_notify_insert_id'));
            $this->postdata = $_POST['pancake_assignment_data'];
            unset($_POST['pancake_assignment_data']);

            # Only set data if the record already exists, otherwise _inserted_record will.
            if (!empty($this->postdata['item_id'])) {
                $this->set($this->postdata['item_type'], $this->postdata['item_id'], $this->postdata['permission_levels']);

                if ($this->postdata['item_type'] == 'clients') {
                    $this->process_clients_permissions($this->postdata['item_id']);
                }
            }
        }
    }

    /**
     * Whether a user can see hourly rates / project costs or not.
     * At the moment, it doesn't have any permissions (just a plugin hook), but this will be handy to have when RBAC is added to Pancake.
     *
     * @param int $project_id
     * @param int $task_id
     *
     * @return bool
     */
    function can_see_project_rates($project_id = null, $task_id = null) {
        $can_see_project_rates = get_instance()->dispatch_return('decide_can_see_project_rates', array(
            'project_id' => $project_id,
            'task_id' => $task_id,
        ), 'boolean');

        if (is_array($can_see_project_rates)) {
            # No plugins available.
            $can_see_project_rates = true;
        }

        return $can_see_project_rates;
    }

    /**
     * Set assignments for a particular item, for one or more users.
     * Will set assignments as in $permission_levels.
     *
     * @param string         $item_type
     * @param string|integer $item_id
     * @param array          $permission_levels
     */
    function set($item_type, $item_id, $permission_levels) {

        $existing = $this->get_assignments($item_type, $item_id);

        $data = array(
            'item_type' => $item_type,
            'item_id' => $item_id,
        );

        foreach ($permission_levels as $user_id => $permission_level) {
            $data['user_id'] = $user_id;
            unset($data['can_read']);
            unset($data['can_update']);
            unset($data['can_delete']);
            unset($data['can_send']);
            unset($data['can_generate_from_project']);

            $permission_level = str_split(str_pad($permission_level, 5, 0, STR_PAD_RIGHT), 1);
            $method = 'insert';

            if (isset($existing[$user_id])) {
                $this->db->where($data);
                $method = 'update';
            }

            $data['can_read'] = $permission_level[0];
            $data['can_update'] = $permission_level[1];
            $data['can_delete'] = $permission_level[2];
            $data['can_generate_from_project'] = $permission_level[3];
            $data['can_send'] = $permission_level[4];
            $this->db->$method('assignments', $data);
        }
    }

}