<?php

defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package             Pancake
 * @author              Pancake Dev Team
 * @copyright           Copyright (c) 2014, Pancake Payments
 * @license             https://pancakeapp.com/license
 * @link                https://pancakeapp.com
 * @since               Version 4.6.0
 */
// ------------------------------------------------------------------------

/**
 * The Clients Meta Model
 *
 * @subpackage    Models
 * @category      Clients
 */
class Clients_meta_m extends Pancake_Model {

    protected $table = 'clients_meta';

    function store($client_id, $labels, $values) {
        $data = array();
        $fields = $this->fetch_fields();

        foreach ($labels as $key => $label) {
            if (strlen($values[$key]) == 0) {
                continue;
            }

            $values[$key] = trim($values[$key]);

            if (isset($fields[$key]) and $fields[$key]['label'] != $label) {
                $this->db->where("label", $fields[$key]['label'])->update($this->table, array(
                    "label" => $label,
                    "slug" => $this->get_slug($label),
                ));
            }

            $data[] = array(
                "client_id" => $client_id,
                "label" => $label,
                "slug" => $this->get_slug($label),
                "value" => $values[$key],
            );
        }

        $this->db->where("client_id", $client_id)->delete($this->table);
        if (count($data) > 0) {
            return $this->db->insert_batch($this->table, $data);
        } else {
            return true;
        }
    }

    function get_slug($label) {
        return url_title($label, 'dash', true);
    }

    function fetch_fields() {
        $fields = $this->db->distinct()->select("slug, label")->get($this->table)->result_array();
        $return = array();
        foreach ($fields as $field) {
            $return[$field['slug']] = array(
                "slug" => $field['slug'],
                "label" => $field['label'],
                "value" => null,
            );
        }

        return $return;
    }

    function fetch($client_id = null) {
        $return = $this->fetch_fields();

        if ($client_id > 0) {
            $buffer = $this->db->select("value, slug")->where("client_id", $client_id)->get($this->table)->result_array();
            foreach ($buffer as $field) {
                $return[$field['slug']]['value'] = $field['value'];
            }
        }

        return $return;
    }

    function fetch_all() {
        $fields = $this->fetch_fields();
        $return = array();

        $buffer = $this->db->select("client_id, value, slug")->get($this->table)->result_array();
        foreach ($buffer as $field) {
            if (!isset($return[$field['client_id']])) {
                $return[$field['client_id']] = $fields;
            }

            $return[$field['client_id']][$field['slug']]['value'] = $field['value'];
        }

        return $return;
    }

}
