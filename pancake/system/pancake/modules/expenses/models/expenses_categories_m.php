<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright	Copyright (c) 2010, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * The Item Model
 *
 * @subpackage	Models
 * @category	Items
 */
class Expenses_categories_m extends Pancake_Model
{
	protected $table = 'project_expenses_categories';

	protected $validate = array(
		array(
			'field'	  => 'name',
			'label'	  => 'lang:global:name',
			'rules'	  => 'required|max_length[255]',
		),
		array(
			'field'	  => 'description',
			'label'	  => 'lang:global:description',
			'rules'	  => '',
		),
		array(
			'field'	  => 'parent_id',
			'label'	  => 'lang:items:quantity',
			'rules'	  => 'numeric',
		),
		array(
			'field'	  => 'notes',
			'label'	  => 'lang:items:tax_rate',
			'rules'	  => '',
		),
	);
	
	public static function type_dropdown()
	{
		return array(
			'standard' => __('items:select_standard'),
			'expense'  => __('items:select_expense')
		);
	}

    public function get_tiers($id = NULL, $active = FALSE) {
        $buffer = $this->db->where('deleted', 0)->order_by('name')->get($this->table)->result();
        $results = array();

        foreach ($buffer as $row) {
            $is_zero = ($id === null or $id === 0);
            if ($is_zero and ($row->parent_id == null or $row->parent_id == 0)) {
                $results[] = $row;
                continue;
            }
            if ($row->parent_id == $id) {
                $results[] = $row;
                continue;
            }
        }

        foreach ($results as &$row) {
            $row->categories = $this->get_tiers($row->id, $active);
        }

        return $results;
    }

    public function get_parents() {
        $buffer = $this->db->order_by('name')->get($this->table)->result();
        $results = array();

        foreach ($buffer as $row) {
            if ($row->parent_id == null or $row->parent_id == 0) {
                $results[] = $row;
                continue;
            }
        }

        return $results;
    }

    public function join_parent()
	{
		
		$this->db->select('project_expenses_categories.*, c1.name parent_name');
		$this->db->join('project_expenses_categories c1', 'c1.id = project_expenses_categories.parent_id', 'left');
		return $this;

	}

	public function active()
	{
		$this->db->where('deleted', 0);
		return $this;
	}

    public function search($query) {
        $clients = $this->db->select('id, name')->get($this->table)->result_array();

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
                'id' => $id,
            );
        }

        return $return;
    }

}

/* End of file: item_m.php */