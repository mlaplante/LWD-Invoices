<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright           Copyright (c) 2012, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 3.6
 */
// ------------------------------------------------------------------------

/**
 * The Project Task Statuses Model
 *
 * @subpackage	Models
 * @category	Projects
 */
class Project_task_statuses_m extends Pancake_Model {

    protected $table = 'project_task_statuses';

    function getDropdown() {
        $buffer = $this->get_all();
        $return = array(
            '0' => __('tickets:no_status'),
        );
        foreach ($buffer as $row) {
            $return[$row->id] = $row->title;
        }
        return $return;
    }
    
    public function search($query) {
        $clients = $this->db->select('id, title as name')->get($this->table)->result_array();

        $buffer = array();
        $details = array();
        $query = strtolower($query);

        foreach ($clients as $row) {
            $subbuffer = array();
            $subbuffer[] = levenshtein($query, strtolower($row['name']), 1, 20, 20);

            sort($subbuffer);

            $buffer[$row['id']] = reset($subbuffer);
            $details[$row['id']] = $row['name'];
        }

        asort($buffer);
        $return = array();

        foreach (array_slice($buffer, 0, 3, true) as $id => $levenshtein) {
            $return[] = array(
                'levenshtein' => $levenshtein,
                'name' => $details[$id],
                'id' => $id
            );
        }

        return $return;
    }

}