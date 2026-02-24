<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author        Pancake Dev Team
 * @copyright    Copyright (c) 2010, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link        http://pancakeapp.com
 * @since        Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * The Item Model
 *
 * @subpackage    Models
 * @category    Items
 */
class Item_m extends Pancake_Model
{
    protected $validate = array(
        array(
            'field' => 'name',
            'label' => 'lang:global:name',
            'rules' => 'required|max_length[255]',
        ),
        array(
            'field' => 'description',
            'label' => 'lang:global:description',
            'rules' => '',
        ),
        array(
            'field' => 'qty',
            'label' => 'lang:items:quantity',
            'rules' => 'required|numeric',
        ),
        array(
            'field' => 'rate',
            'label' => 'lang:tasks:rate',
            'rules' => 'required|numeric',
        ),
        array(
            'field' => 'tax_id',
            'label' => 'lang:items:tax_rate',
            'rules' => 'numeric',
        ),
    );

    function store_taxes($item_id, $tax_ids)
    {
        $insert_batch = array();
        foreach ($tax_ids as $id) {
            $insert_batch[] = array(
                "tax_id" => $id,
                "item_id" => $item_id,
            );
        }

        $this->db->where("item_id", $item_id)->delete("items_taxes");

        if (count($insert_batch)) {
            $this->db->insert_batch("items_taxes", $insert_batch);
        }
    }

    function flexible_get_all($config)
    {
        $per_page = isset($config['per_page']) ? $config['per_page'] : 0;
        $offset = isset($config['offset']) ? $config['offset'] : null; # if offset is NOT null, then it was provided, meaning we want pagination
        $order = isset($config['order']) ? $config['order'] : array('name' => 'asc');
        $object = isset($config['return_object']) ? $config['return_object'] : true;
        $get_single = isset($config['get_single']) ? $config['get_single'] : false;
        $id = isset($config['id']) ? $config['id'] : null;

        if ($id !== null) {
            if (!is_array($id)) {
                $id = array($id);
            }

            if (empty($id)) {
                $this->db->where("0", null, false);
            } else {
                $this->db->where_in('items.id', $id);
            }
        }

        if ($get_single) {
            $this->db->limit(1);

            # Override the $per_page if $offset is provided, so it'll still be the right offset but only one record.
            $per_page = 1;
        }

        # If offset is NOT null, then it was provided, meaning we want pagination.
        if ($offset !== null) {
            $this->db->limit($per_page, $offset);
        }

        foreach ($order as $field_to_order_by => $desc_or_asc) {
            $this->db->order_by('items.' . $field_to_order_by, strtoupper($desc_or_asc));
        }

        $result = $this->db->get($this->table)->result();

        $ids = array();
        foreach ($result as $row) {
            $ids[] = $row->id;
        }

        $all_taxes = array();
        if (count($ids) > 0) {
            $buffer = $this->db->select("tax_id, item_id")->where_in("item_id", $ids)->order_by("tax_id", "asc")->get("items_taxes")->result_array();
            foreach ($buffer as $row) {
                if (!isset($all_taxes[$row["item_id"]])) {
                    $all_taxes[$row["item_id"]] = new stdClass();
                }

                $all_taxes[$row["item_id"]]->{$row["tax_id"]} = $row["tax_id"];
            }
        }

        $return = array();
        foreach ($result as $row) {
            unset($row->tax_id);

            $row->label = $row->name;
            $row->tax_label = "{{no_tax}}";

            if (isset($all_taxes[$row->id])) {
                $taxes = array();
                foreach ($all_taxes[$row->id] as $tax_id) {
                    if ($tax_id > 0) {
                        $tax = Settings::tax($tax_id);
                        $taxes[] = $tax['name'];
                    }
                }

                if (count($taxes) > 0) {
                    $row->tax_label = implode_to_human_csv($taxes);
                }
                $row->tax_ids = $object ? $all_taxes[$row->id] : (array)$all_taxes[$row->id];
            }

            $return[$row->id] = $object ? $row : (array)$row;
        }

        if ($get_single) {
            $return = reset($return);
        }

        return $return;
    }

    public static function type_dropdown()
    {
        return array(
            'standard' => __('items:select_standard'),
            'flat_rate' => __('items:select_flat_rate'),
            'expense' => __('items:select_expense'),
            'time_entry' => __('items:select_time_entry'),
            'fixed_discount' => __('items:fixed_discount', array(Currency::symbol())),
            'percentage_discount' => __('items:percentage_discount'),
            'period_day' => __("items:period") . " / " . __('items:period_day'),
            'period_week' => __("items:period") . " / " . __('items:period_week'),
            'period_month' => __("items:period") . " / " . __('items:period_month'),
            'period_year' => __("items:period") . " / " . __('items:period_year'),
        );
    }

}

/* End of file: item_m.php */