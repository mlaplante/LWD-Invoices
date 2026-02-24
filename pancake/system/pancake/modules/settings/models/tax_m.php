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
 * The Tax Model
 *
 * @subpackage	Models
 * @category	Settings
 */
class Tax_m extends Pancake_Model
{

	public function update_taxes($names, $values, $regs, $compounds)
	{
		if (!is_array($names)) {
			return true;
		}

		$this->db->trans_begin();

		foreach ($names as $id => $name)
		{
			$this->db->where('id', $id);
			
			// Delete if the name is removed
			if ( ! $name)
			{
				$this->db->delete($this->table);
				continue;
			}
			
			$this->db->update($this->table, array(
				'name' => $name,
				'value' => $values[$id],
				'reg' => $regs[$id],
                                'is_compound' => isset($compounds[$id]),
			));

		}

		if ($this->db->trans_status() === FALSE)
		{
			$this->db->trans_rollback();
			return FALSE;
		}

		$this->db->trans_commit();
		return TRUE;
	}
        
        public function create_if_not_exists($percentage, $name = null) {
            if (str_ends_with($percentage, "%")) {
                $percentage = substr($percentage, 0, -1);
            }

            $row = $this->db->where('value', $percentage)->get('taxes')->row_array();
            if (isset($row['name'])) {
                return (int) $row['id'];
            } else {
                $percentage = round($percentage, 10);
                $this->db->insert('taxes', array(
                    'name' => $name === null ? "$percentage% Tax" : ($name . " ($percentage%)"),
                    'value' => $percentage
                ));

                # Refresh the taxes in settings.
                $this->settings->reload();
                
                return $this->db->insert_id();
            }
        }
        
        public function search($query) {
            $records = $this->db->select('id, name')->get('taxes')->result_array();

            $buffer = array();
            $details = array();
            $query = strtolower($query);

            foreach ($records as $row) {
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

	public function insert_taxes($names, $values, $regs, $compounds)
	{
		$this->db->trans_begin();

		foreach ($names as $id => $name)
		{
			if ($name)
			{
				$this->db->insert($this->table, array(
					'name' => $name,
					'value' => $values[$id],
					'reg' => $regs[$id],
                                        'is_compound' => isset($compounds[$id]),
				));
			}
		}

		if ($this->db->trans_status() === FALSE)
		{
			$this->db->trans_rollback();
			return FALSE;
		}

		$this->db->trans_commit();
		return TRUE;
	}

    public function calculate_amount_excluding_tax($amount_including_tax, $tax_ids = [], $decimal_places = 2) {
        if (count($tax_ids) == 0) {
            return $amount_including_tax;
        }

        $row_taxes = Settings::all_taxes();
        foreach ($row_taxes as $tax_id => $tax) {
            if (!in_array($tax_id, $tax_ids)) {
                unset($row_taxes[$tax_id]);
            }
        }

        $total_non_compound_tax_percentage = 0;
        foreach ($row_taxes as $tax) {
            if (!$tax['is_compound']) {
                $total_non_compound_tax_percentage += $tax["value"] / 100;
            }
        }

        $denominator = 1 + $total_non_compound_tax_percentage;
        foreach ($row_taxes as $tax) {
            if ($tax['is_compound']) {
                $tax_value = $tax['value'] / 100;
                $denominator += $tax_value;
                $denominator += $tax_value * $total_non_compound_tax_percentage;
            }
        }

        $amount_excluding_tax = $amount_including_tax / $denominator;
        return round($amount_excluding_tax, $decimal_places);
    }
}

/* End of file: tax_m.php */