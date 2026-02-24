<?php

defined('BASEPATH') or exit('No direct script access allowed');

/**
 * Currency Library
 */
class Currency {

    const DEFAULT_FORMAT = '{"symbol":"before","decimal":".","thousand":",","decimals":2}';

    private static $_current = 'USD';
    protected static $_convert_cache = null;

    # A default set of currencies. To add more use the config file, or as a currency in Settings > Currencies
    private static $_currencies;

    /**
     * @var \Money\Currencies\ISOCurrencies
     */
    protected static $iso_currencies;

    /**
     * @var \Money\MoneyFormatter
     */
    protected static $formatter;

    public function __construct($params = array()) {
        if (isset($params['currencies'])) {
            foreach ($params['currencies'] as $code => $array) {
                $params['currencies'][$code]['name'] = $array['name'];
            }
            self::$_currencies = $params['currencies'];
        }

        $db = get_instance()->db;
        $currencies = $db->get('currencies')->result_array();
        foreach ($currencies as $currency) {
            self::$_currencies[$currency['code']] = array(
                "symbol" => isset(self::$_currencies[$currency['code']]) ? self::$_currencies[$currency['code']]['symbol'] : $currency['code'],
                "name" => $currency['name'],
                "format" => isset($currency['format']) ? $currency['format'] : self::DEFAULT_FORMAT,
            );
        }

        asort(self::$_currencies);

        self::$iso_currencies = new \Money\Currencies\ISOCurrencies();
        self::$formatter = new \Money\Formatter\DecimalMoneyFormatter(self::$iso_currencies);
    }

    public static function set($currency) {
        self::$_current = $currency;
    }

    public static function get() {
        return self::$_currencies[self::$_current];
    }

    public static function currencies() {
        return self::$_currencies;
    }

    public static function symbol($code = null) {
        $code or $code = self::$_current;
        if (is_array($code) and isset($code['code'])) {
            $code = $code['code'];
        }

        // Only use the symbol if we know how to show it, otherwise show code
        if (isset(self::$_currencies[$code]['symbol'])) {
            return self::$_currencies[$code]['symbol'];
        } else {
            return $code;
        }
    }

    public static function code($currency_id = 0) {
        if ($currency_id == 0) {
            return self::$_current;
        }

        # A currency from the DB.
        $CI = &get_instance();
        $currency = $CI->db->get_where('currencies', array('id' => $currency_id))->row();
        return !empty($currency) ? $currency->code : self::$_current;
    }

    public static function id($currency_code = 0) {
        if (empty($currency_code)) {
            return 0;
        }

        # A currency from the DB.
        $CI = &get_instance();
        $currency = $CI->db->get_where('currencies', array('code' => $currency_code))->row();
        return !empty($currency) ? (int) $currency->id : 0;
    }

    public static function format($amount, $code = null, $allow_more_than_default_decimals = false) {
        if ($amount instanceof \Money\Money) {
            $code = $amount->getCurrency()->getCode();
            $amount = self::$formatter->format($amount);
        } else {
            // If an ID is passed then find the code, and use that
            if (is_numeric($code) and $code > 0) {
                $code = self::code($code);
            }

            if (empty($code)) {
                $code = Currency::code();
            }
        }

        if (isset(self::$_currencies[$code])) {
            $format = isset(self::$_currencies[$code]['format']) ? self::$_currencies[$code]['format'] : self::DEFAULT_FORMAT;
            $code = self::$_currencies[$code]['symbol'];
        } else {
            $code = $code . " ";
            $format = self::DEFAULT_FORMAT;
        }

        $format = json_decode($format, true);

        $code = Currency::symbol($code);
        $decimals = $format['decimals'];

        if ($allow_more_than_default_decimals) {
            $exploded = explode(".", $amount);
            if (isset($exploded[1])) {
                $decimals = max($format['decimals'], strlen($exploded[1]));
            }
        }

        $is_negative = (round($amount, $decimals) < 0);

        $formatted = number_format(abs($amount), $decimals, $format['decimal'], $format['thousand']);
        $formatted = ($format['symbol'] == "before") ? "$code $formatted" : "$formatted $code";

        if ($is_negative) {
            $formatted = "-" . $formatted;
        }

        return $formatted;
    }

    public static function switch_default($new_default_currency_code) {

        $old_default_currency_code = self::code();

        if ($new_default_currency_code == $old_default_currency_code) {
            # No need to change anything.
            return;
        }

        if (!isset(self::$_currencies[$old_default_currency_code])) {
            throw new Exception("It is not possible to switch Pancake's default currency from '$old_default_currency_code' to '$new_default_currency_code' (original currency not supported).");
        }

        if (!isset(self::$_currencies[$new_default_currency_code])) {
            throw new Exception("It is not possible to switch Pancake's default currency from '$old_default_currency_code' to '$new_default_currency_code' (target currency not supported).");
        }

        $CI = get_instance();
        $buffer = $CI->db->get('currencies')->result_array();
        $currencies = array();
        $batch_updates = array();
        foreach ($buffer as $row) {
            $currencies[$row['code']] = $row;
            $batch_updates[] = array(
                'code' => $row['code'],
                'rate' => self::convert(1, $new_default_currency_code, $row['code'], true, $new_default_currency_code),
            );
        }

        if (count($batch_updates) > 0) {
            $CI->db->update_batch('currencies', $batch_updates, 'code');
        }

        self::_reset_convert_cache();

        $old_exchange_rate = self::convert(1, $new_default_currency_code, $old_default_currency_code);

        if (!isset($currencies[$old_default_currency_code])) {
            $CI->currency_m->insert_currencies(self::$_currencies[$old_default_currency_code]['name'], $old_default_currency_code, $old_exchange_rate, array());
        }

        if (!isset($currencies[$new_default_currency_code])) {
            $CI->currency_m->insert_currencies(self::$_currencies[$new_default_currency_code]['name'], $new_default_currency_code, 1, array());
        }

        $new_currency_id = $CI->db->select('id')->where('code', $new_default_currency_code)->get('currencies')->row_array();
        $new_currency_id = $new_currency_id['id'];

        $old_currency_id = $CI->db->select('id')->where('code', $old_default_currency_code)->get('currencies')->row_array();
        $old_currency_id = $old_currency_id['id'];

        $tables = array('invoices', 'projects', 'project_templates');
        foreach ($tables as $table) {
            $CI->db->where('currency_id', 0)->update($table, array(
                'currency_id' => $old_currency_id,
                'exchange_rate' => $old_exchange_rate,
            ));

            $CI->db->where('currency_id', $new_currency_id)->update($table, array(
                'currency_id' => 0,
                'exchange_rate' => 1,
            ));

            foreach ($currencies as $code => $currency) {
                if ($code != $old_default_currency_code and $code != $new_default_currency_code) {
                    $CI->db->where('currency_id', $currency['id'])->update($table, array(
                        'exchange_rate' => self::convert(1, $new_default_currency_code, $code),
                    ));
                }
            }
        }
    }

    /**
     * Converts $amount from a currency code to another.
     * Use Settings::get('currency') to get the default currency.
     *
     * @param float  $amount
     * @param string $from
     * @param string $to
     * @param bool   $force_refresh
     * @param string $base_currency_code
     *
     * @return float
     */
    public static function convert($amount, $from, $to = null, $force_refresh = false, $base_currency_code = null) {
        if ($base_currency_code === null) {
            $base_currency_code = Settings::get('currency');
        }

        if (empty($from)) {
            $from = Settings::get('currency');
        }

        if (empty($to)) {
            $to = Settings::get('currency');
        }

        if ($from == $to) {
            return $amount;
        }

        return $amount * self::get_rate($from, $to, $force_refresh, $base_currency_code);
    }

    /**
     * Get the conversion rate from $from to $to.
     *
     * @param string $from A 3-character currency code.
     * @param string $to A 3-character currency code.
     * @param bool $force_refresh Whether or not to force a refresh of the exchange rates.
     * @param null $base_currency_code Pancake's default currency setting. It's settable here for when we're switching them.
     *
     * @return float
     * @throws Exception If it cannot convert between the two currencies.
     */
    protected static function get_rate($from, $to, $force_refresh = false, $base_currency_code = null) {
        self::_cache_convert_currencies();

        if (!isset(self::$_convert_cache[$base_currency_code])) {
            self::$_convert_cache[$base_currency_code] = 1;
        }

        if ($base_currency_code === null) {
            $base_currency_code = Settings::get('currency');
        }

        if (isset(self::$_convert_cache[$from]) && isset(self::$_convert_cache[$to]) && !$force_refresh) {
            return (1 / self::$_convert_cache[$from]) * self::$_convert_cache[$to];
        }

        $url = "http://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
        $xml = get_guzzle_instance()->get($url)->getBody()->getContents();
        libxml_use_internal_errors(true);
        $xml = simplexml_load_string($xml);
        $rates = ["EUR" => 1];
        foreach ($xml->Cube->Cube->children() as $rate) {
            /** @var SimpleXMLElement $rate */
            $rates[(string) $rate["currency"]] = (float) $rate["rate"];
        }

        # Adjust all rates to be based on the default currency, not EUR.
        foreach ($rates as $code => $rate) {
            $rates[$code] = (1 / $rate) * $rates[$base_currency_code];
        }

        if (!isset($rates[$from]) || !isset($rates[$to])) {
            throw new Exception("Could not find a currency conversion from $from to $to.");
        }

        if ($force_refresh) {
            $from_rate = $rates[$from];
            $to_rate = $rates[$to];
        } else {
            $from_rate = isset(self::$_convert_cache[$from]) ? self::$_convert_cache[$from] : $rates[$from];
            $to_rate = isset(self::$_convert_cache[$to]) ? self::$_convert_cache[$to] : $rates[$to];
        }

        # EUR-USD = (1/1) * 1.1795 = 1.1795 Correct
        # USD-EUR = (1/1.1795) * 1 = 0.8478 Correct
        # USD-THB = (1/1.1795) * 38.723 = 32.83 Correct
        return (1 / $from_rate) * $to_rate;
    }

    protected static function _cache_convert_currencies() {
        if (self::$_convert_cache === null) {
            $buffer = get_instance()->db->get('currencies')->result_array();
            foreach ($buffer as $row) {
                $row['rate'] = filter_var($row['rate'], FILTER_VALIDATE_FLOAT, FILTER_FLAG_ALLOW_THOUSAND);
                self::$_convert_cache[$row['code']] = $row['rate'];
            }
        }
    }

    protected static function _reset_convert_cache() {
        self::$_convert_cache = null;
    }

}
