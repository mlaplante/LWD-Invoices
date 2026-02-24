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
 * The Clients Taxes Model
 *
 * @subpackage    Models
 * @category      Clients
 */
class Clients_taxes_m extends Pancake_Model {

    protected $table = 'clients_taxes';

    function store($client_id, $tax) {
        $data = array();
        foreach ($tax as $tax_id => $tax_number) {
            $data[] = array(
                "client_id" => $client_id,
                "tax_id" => $tax_id,
                "tax_registration_id" => $tax_number,
            );
        }

        $this->db->where("client_id", $client_id)->delete($this->table);
        if (count($data) > 0) {
            $result = $this->db->insert_batch($this->table, $data);
        } else {
            $result = true;
        }

        $this->clients_m->update($client_id, ["has_custom_tax_ids" => 1], true);
        return $result;
    }

    function set_default($client_id, $taxes) {
        foreach ($taxes as $tax_id) {
            $this->db->where("client_id", $client_id);
            $this->db->where("tax_id", $tax_id);
            if ($this->db->count_all_results($this->table)) {
                $this->db->where("client_id", $client_id);
                $this->db->where("tax_id", $tax_id);
                $this->db->update($this->table, [
                    "is_default" => 1,
                ]);
            } else {
                $this->db->insert($this->table, [
                    "client_id" => $client_id,
                    "tax_id" => $tax_id,
                    "is_default" => 1,
                ]);
            }
        }

        $this->clients_m->update($client_id, ["has_custom_tax_ids" => 1], true);

        return true;
    }

    function get_default($client_id) {
        $this->db->select('has_custom_tax_ids');
        $this->db->where('id', $client_id);
        $has_custom_tax_ids = $this->db->get('clients')->row_array();
        $has_custom_tax_ids = $has_custom_tax_ids["has_custom_tax_ids"];

        if ($has_custom_tax_ids) {
            $this->db->select('tax_id');
            $this->db->where('client_id', $client_id);
            $this->db->where('is_default', 1);
            $rows = $this->db->get($this->table)->result_array();
            return array_values(array_map(function ($row) {
                return (int) $row['tax_id'];
            }, $rows));
        } else {
            return array_values(array_map(function ($tax_id) {
                return (int) $tax_id;
            }, Settings::get_default_tax_ids()));
        }
    }

    function get_default_per_client() {
        $default_tax_ids = array_values(array_map(function ($tax_id) {
            return (int) $tax_id;
        }, Settings::get_default_tax_ids()));

        $clients_has_custom_tax = [];

        $rows = $this->db->select('id, has_custom_tax_ids')->get('clients')->result_array();
        $return = [];
        foreach ($rows as $row) {
            $clients_has_custom_tax[$row['id']] = $row['has_custom_tax_ids'];
            $return[$row['id']] = $row['has_custom_tax_ids'] ? [] : $default_tax_ids;
        }

        $this->db->where('is_default', 1);
        $rows = $this->db->get($this->table)->result_array();

        foreach ($rows as $row) {
            if (!isset($return[$row["client_id"]])) {
                continue;
            }

            if ($clients_has_custom_tax[$row["client_id"]]) {
                $return[$row["client_id"]][] = (int) $row["tax_id"];
            }
        }
        return $return;
    }

    function fetch($client_id) {
        $return = array();
        $buffer = $this->db->select("tax_id, tax_registration_id")->where("client_id", $client_id)->get($this->table)->result_array();
        foreach ($buffer as $field) {
            $field['tax_registration_id'] = trim($field['tax_registration_id']);
            if (!empty($field['tax_registration_id'])) {
                $return[$field['tax_id']] = $field['tax_registration_id'];
            }
        }

        return $return;
    }

    function fetch_all() {
        $return = array();
        $buffer = $this->db->select("tax_id, client_id, tax_registration_id")->get($this->table)->result_array();
        foreach ($buffer as $field) {
            if (!isset($return[$field['client_id']])) {
                $field['tax_registration_id'] = trim($field['tax_registration_id']);
                if (!empty($field['tax_registration_id'])) {
                    $return[$field['client_id']][$field['tax_id']] = $field['tax_registration_id'];
                }
            }
        }

        return $return;
    }

}
