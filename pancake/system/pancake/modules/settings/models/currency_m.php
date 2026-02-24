<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2010, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link           http://pancakeapp.com
 * @since          Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * The Settings Model
 *
 * @subpackage    Models
 * @category      Settings
 */
class Currency_m extends Pancake_Model {
    /**
     * @var string    The name of the settings table
     */
    protected $table = 'currencies';

    public function search($query) {

        $config = array();
        include APPPATH . 'config/currency.php';

        $buffer = array();
        $details = array();
        $query = strtolower($query);

        foreach ($config['currencies'] as $code => $row) {
            $subbuffer = array();
            $subbuffer[] = levenshtein($query, strtolower($code), 1, 20, 20);
            $subbuffer[] = levenshtein($query, strtolower($row['symbol']), 1, 20, 20);
            $subbuffer[] = levenshtein($query, strtolower($row['name']), 1, 20, 20);
            sort($subbuffer);
            $buffer[$code] = reset($subbuffer);
            $details[$code] = $row['name'];
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

    /**
     * Gets a currency by code.
     * If it does not exist, it will be created.
     *
     * @param string $code
     */
    function getByCode($code) {
        $config = array();
        include APPPATH . 'config/currency.php';
        if (!isset($config['currencies'][$code])) {
            return array('name' => '', 'id' => 0, 'code' => $code, 'rate' => 0);
        } else {
            $row = $this->db->where('code', $code)->get('currencies')->row_array();
            if (!isset($row['code'])) {
                $this->db->insert('currencies', array(
                    'name' => $config['currencies'][$code]['name'],
                    'rate' => Currency::convert(1, Settings::get('currency'), $code),
                    'code' => $code,
                ));

                $row = $this->db->where('code', $code)->get('currencies')->row_array();
            }

            return $row;
        }
    }

    function process_rates($rates) {
        if (!is_array($rates)) {
            $rates = array($rates);
        }

        foreach ($rates as &$rate) {
            $rate = str_ireplace(',', '.', $rate);
        }
        return $rates;
    }

    public function update_currencies($names, $codes, $rates, $formats) {

        $rates = $this->process_rates($rates);

        $this->db->trans_begin();

        foreach ($names as $id => $name) {
            // Missing nme and code, so just delete
            if (!$name and !$codes[$id]) {
                $this->db->delete($this->table, array('id' => $id));
            } // This ensures we are only updating what has changed
            else if (Settings::currency($id) != $rates[$id]) {
                $format = isset($formats[$id]) ? $formats[$id] : Currency::DEFAULT_FORMAT;
                $data = array('name' => $name, 'code' => strtoupper($codes[$id]), 'rate' => $rates[$id], 'format' => $format);
                $this->db->where('id', $id)->update($this->table, $data);
            }
        }

        if ($this->db->trans_status() === false) {
            $this->db->trans_rollback();
            return false;
        }

        $this->db->trans_commit();
        return true;
    }

    public function insert_currencies($names, $codes, $rates, $formats) {
        $rates = $this->process_rates($rates);

        $this->db->trans_begin();

        if (!is_array($names)) {
            $names = array($names);
        }

        if (!is_array($codes)) {
            $codes = array($codes);
        }

        if (!is_array($rates)) {
            $rates = array($rates);
        }

        if (!is_array($formats)) {
            $formats = array($formats);
        }

        foreach ($names as $id => $name) {
            if ($name and $codes[$id]) {
                $format = isset($formats[$id]) ? $formats[$id] : Currency::DEFAULT_FORMAT;
                $data = array('name' => $name, 'code' => $codes[$id], 'rate' => ($rates[$id] == 0) ? 1 : $rates[$id], 'format' => $format);
                $this->db->insert($this->table, $data);
            }
        }

        if ($this->db->trans_status() === false) {
            $this->db->trans_rollback();
            return false;
        }

        $this->db->trans_commit();
        return true;
    }
}

/* End of file: settings_m.php */