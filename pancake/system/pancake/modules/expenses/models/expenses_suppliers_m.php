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
class Expenses_suppliers_m extends Pancake_Model
{
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
			'field'	  => 'notes',
			'label'	  => 'lang:global:notes',
			'rules'	  => '',
		),

	);

	protected $table = 'project_expenses_suppliers';
	
	public static function type_dropdown()
	{
		return array(
			'standard' => __('items:select_standard'),
			'expense'  => __('items:select_expense')
		);
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