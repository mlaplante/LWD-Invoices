<?php

use League\Csv\CharsetConverter;
use League\Csv\Info;
use League\Csv\Reader;

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright	Copyright (c) 2011, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 3.2
 */
// ------------------------------------------------------------------------

/**
 * The Pancake Import / Export System Model
 *
 * @subpackage	Models
 * @category	Pie
 */
class Pie_m extends Pancake_Model {

    public $error;

    function txt_to_array($filename) {
        $object_to_array = function ($obj) use (&$object_to_array) {
            if (is_object($obj)) {
                $obj = (array) $obj;
            }
            if (is_array($obj)) {
                $new = array();
                foreach ($obj as $key => $val) {
                    $new[$key] = $object_to_array($val);
                }
            } else {
                $new = $obj;
            }
            return $new;
        };

        $contents = file_get_contents($filename);
        $contents = @unserialize($contents);
        return $contents ? array('fields' => array_keys($contents), 'records' => $object_to_array($contents)) : false;
    }

    function csv_to_array($filename, $has_headers = true)
    {
        $csv = Reader::createFromPath($filename);
        $stats = Info::getDelimiterStats($csv, [',', ';', '|', "\t"]);
        arsort($stats);
        $delimiter = array_keys($stats)[0];
        $csv->setDelimiter($delimiter);

        if ($has_headers) {
            $csv->setHeaderOffset(0);
        }

        $bytes_to_read = 10 * 1024;
        $handle = fopen($filename, "rb");
        $sample_content = fread($handle, $bytes_to_read);
        fclose($handle);

        # Some CSVs use 'line tabulation' characters to delimit newlines.
        # We setup the character here and replace it in all the values later.
        $line_tab = '\u000B';
        $line_tab = json_decode('"' . $line_tab . '"');

        # If the mb extension is enabled, try to fix any encoding issues in the CSV.
        # Otherwise, there's little we can do but assume it's UTF-8 and hope it is.
        # I'm not proud of this, but we can't control the environment Pancake runs on.
        $encoding = mb_detect_encoding($sample_content, ['ASCII', 'UTF-8', 'ISO-8859-1', 'ISO-8859-9'], true);

        if (!isset($encoding)) {
            throw new RuntimeException("Cannot detect encoding for the imported file.");
        }

        $encoder = (new CharsetConverter())->inputEncoding($encoding);
        $csv = $encoder->convert($csv);

        $records = [];
        foreach ($csv as $record) {
            $records[] = str_replace($line_tab, "\n", $record);
        }

        $fields = [];
        if ($has_headers) {
            $fields = array_keys($records[0]);
        } else {
            $fields = $records[0];
        }

        return array('fields' => $fields, 'records' => $records);
    }

    function _xml_subset_to_array($simplexml_element, $flatten = false, $level = 1) {
        $new_v = array();

        $attributes = array();

        foreach ($simplexml_element->attributes() as $field => $value) {
            $attributes['attribute_' . $field] = (string) $value;
        }

        $arrayed_fields = array();

        foreach ($simplexml_element as $field => $value) {

            foreach ($value->attributes() as $attr_name => $attr_val) {
                $attributes['attribute_' . $attr_name] = (string) $attr_val;
            }

            if (count($value) == 0) {
                $new_v[$field] = (string) $value;
            } else {
                $arrayed_fields[$field] = $field;
                $new_v[$field][] = $this->_xml_subset_to_array($value, $flatten, $level + 1);
            }
        }

        foreach ($arrayed_fields as $arrayed_field) {
            if (count($new_v[$arrayed_field]) == 1) {
                $new_v[$arrayed_field] = reset($new_v[$arrayed_field]);
            }
        }

        if (count(array_keys($new_v)) == 1) {
            $result = current($new_v);
        } else {
            $result = array_merge($attributes, $new_v);
        }

        $flatten_array = function ($prefix, $array) {
            $return = [];
            foreach ($array as $key => $value) {
                $return[$prefix . $key] = $value;
            }
            return $return;
        };

        if ($flatten && $level == 2) {
            foreach ($result as $key => $value) {
                if (is_array($value)) {
                    $i = 1;
                    foreach ($value as $sub_key => $sub_value) {
                        if (is_array($sub_value)) {
                            $result = array_merge($result, $flatten_array("$key #$i ", $sub_value));
                        } else {
                            $result["$key #1 " . $sub_key] = $sub_value;
                        }
                        $i++;
                    }
                    unset ($result[$key]);
                }
            }
        }

        if ($flatten && $level == 1) {
            # Equalize all results.
            $fields = [];
            foreach ($result as $row) {
                $fields = array_merge($fields, array_keys($row));
            }
            $fields = array_unique($fields);
            $fields_with_empty_values = [];
            foreach ($fields as $field) {
                $fields_with_empty_values[$field] = "";
            }
            foreach ($result as $key => $row) {
                $result[$key] = array_merge($fields_with_empty_values, $row);
            }
        }

        return $result;
    }

    function xml_to_array($filename, $flatten = false) {
        $xml = simplexml_load_file($filename);
        $results = $this->_xml_subset_to_array($xml, $flatten);
        return array('fields' => array_keys(reset($results)), 'records' => $results);
    }

    function iif_to_array($filename) {
        $contents = file_get_contents($filename);
        $contents = iconv('macintosh', 'UTF-8', $contents);

        $contents = str_ireplace("\r\n", "\n", $contents);
        $contents = str_ireplace("\r", "\n", $contents);

        $lines = explode("\n", $contents);
        $client_fields = array();
        $invoice_fields = array();
        $item_fields = array();
        $clients = array();
        $invoices = array();

        $invoice = null;
        foreach ($lines as $line_key => $line) {
            $line = explode("\t", $line);
            $intro = $line[0];

            unset($line[0]);
            switch ($intro) {
                case "!CUST":
                    $client_fields = $line;
                    break;
                case "!TRNS":
                    $invoice_fields = $line;
                    break;
                case "!SPL":
                    $item_fields = $line;
                    break;
                case "TRNS":
                    $invoice = array();

                    if (count($invoice_fields) !== count($line)) {
                        $attempts = 0;
                        $newkey = $line_key + 1;
                        while ($attempts < 10) {
                            $newline = explode("\t", $lines[$newkey]);
                            if ($newline[0] == "SPL" or $newline[0] == "ENDTRNS") {
                                break;
                            } else {
                                # Append to line.
                                $line = array_merge($line, $newline);
                            }
                            $newkey = $newkey + 1;
                            $attempts++;
                        }

                        # This fixes an issue with the key numbering, which is necessary for proper alignment.
                        $line = array_merge(array(0), $line);
                        unset($line[0]);
                    }

                    foreach ($invoice_fields as $key => $field) {
                        if (!isset($line[$key])) {
                            debug($line);
                        }
                        $invoice[$field] = $line[$key];
                    }

                    if (!isset($clients[$invoice["NAME"] . $invoice["ADDR1"]])) {
                        debug($invoice, $invoice["NAME"] . $invoice["ADDR1"], array_keys($clients));
                    }

                    $invoice["CLIENT"] = $clients[$invoice["NAME"] . $invoice["ADDR1"]];

                    unset($invoice["NAME"]);
                    unset($invoice["ADDR1"]);
                    unset($invoice["ADDR2"]);
                    unset($invoice["ADDR3"]);
                    unset($invoice["ADDR4"]);
                    unset($invoice["ADDR5"]);
                    $invoice["ITEMS"] = array();

                    break;
                case "CUST":
                    if (count($client_fields) !== count($line)) {

                        while (end($line) === "") {
                            array_pop($line);
                        }

                        $attempts = 0;
                        $newkey = $line_key + 1;
                        while ($attempts < 10) {
                            $newline = explode("\t", $lines[$newkey]);
                            if ($newline[0] == "CUST" or $newline[0] == "!TRNS") {
                                break;
                            } else {
                                # Append to line.

                                while (reset($newline) === "") {
                                    array_shift($newline);
                                }

                                while (end($newline) === "") {
                                    array_pop($newline);
                                }

                                $line = array_merge($line, $newline);
                            }
                            $newkey = $newkey + 1;
                            $attempts++;
                        }

                        # This fixes an issue with the key numbering, which is necessary for proper alignment.
                        $line = array_merge(array(0), $line);
                        unset($line[0]);
                    }

                    $buffer = array();
                    foreach ($client_fields as $key => $field) {
                        if (!isset($line[$key])) {
                            debug($line);
                        }
                        $buffer[$field] = $line[$key];
                    }
                    $clients[$buffer["NAME"] . $buffer["BADDR1"]] = $buffer;
                    break;
                case "ENDTRNS":
                    $invoices[] = $invoice;
                    $invoice = null;
                    break;
                case "SPL":
                    $buffer = array();
                    foreach ($item_fields as $key => $field) {
                        $buffer[$field] = $line[$key];
                    }

                    unset($buffer["DOCNUM"]);
                    unset($buffer["NAME"]);
                    unset($buffer["DATE"]);

                    $invoice["ITEMS"][] = $buffer;
                    break;
            }
        }

        $first_invoice = reset($invoices);
        return array('fields' => array_keys($first_invoice), 'records' => $invoices);
    }

    function json_to_array($filename) {

        $fields = array();
        $records = array();

        $json = (array) json_decode(file_get_contents($filename));
        foreach ($json as $item) {

            $item = (array) $item;

            foreach ($item as $k => $v) {
                if (is_array($v)) {
                    foreach ($v as $key => $row) {
                        $item[$k][$key] = (array) $row;
                    }
                }
            }

            if (empty($fields)) {
                $fields = array_keys($item);
            }
            $records[] = $item;
        }

        return array('fields' => $fields, 'records' => $records);
    }

    function process($filename, $ext = '', $flatten = false) {
        if (empty($ext)) {
            $ext = pathinfo($filename, PATHINFO_EXTENSION);
        }
        $method = $ext . '_to_array';
        return (method_exists($this, $method)) ? $this->$method($filename, $flatten) : false;
    }

    function prepare_import($type, $filename, $ext) {
        $buffer = $this->process($filename, strtolower($ext));

        $method = 'process_' . $type . '_' . $ext;
        if (method_exists($this, $method) && $this->$method($buffer['fields'], $buffer['records'])) {
            return $buffer;
        } else {
            return false;
        }
    }

    function process_time_entries_csv(&$fields, $records) {
        $CI = &get_instance();
        $CI->load->model('clients/clients_m');
        $CI->load->model('projects/project_m');
        $CI->load->model('projects/project_task_m');
        $CI->load->model('projects/project_time_m');

        $time_entries_csv_types = array(
            15 => array('fname', 'lname', 'date', 'project', 'task', 'hours')
        );

        $type = null;

        foreach ($time_entries_csv_types as $key => $csv_type) {
            if ($fields == $csv_type) {
                $type = $key;
                break;
            }
        }

        switch ($type) {
            case 15:

                foreach ($records as $key => $record) {

                    $client = $CI->clients_m->fetch_details($record['fname'], $record['lname']);
                    $project = $CI->project_m->fetch_details($record['project'], $client['id']);
                    $task = $CI->project_task_m->fetch_details($record['task'], $project['id'], $client['id']);

                    $records[$key] = array(
                        'client_id' => $client['id'],
                        'date' => strtotime($record['date']),
                        'project_id' => $project['id'],
                        'task_id' => $task['id'],
                        'hours' => $record['hours'],
                        'notes' => ''
                    );
                }

                return true;
                break;
            default:
                return false;
                break;
        }
    }

    function process_estimates_xml(&$fields, $records) {

        $CI = &get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('clients/clients_m');

        $invoice_xml_types = array(
            12 => array('attribute_status', 'attribute_total', 'attribute_total_due', 'attribute_created_at', 'attribute_uri', 'attribute_updated_at', 'attribute_amount', 'client', 'number', 'date', 'tags', 'currency', 'tax', 'freight', 'notes', 'lines'),
            13 => array('attribute_created_at', 'attribute_updated_at', 'attribute_status', 'attribute_total', 'attribute_total_due', 'attribute_uri', 'attribute_amount', 'client', 'number', 'date', 'tags', 'currency', 'tax', 'freight', 'notes', 'lines')
        );

        $type = null;

        foreach ($invoice_xml_types as $key => $xml_type) {
            if ($fields == $xml_type) {
                $type = $key;
                break;
            }
        }

        switch ($type) {
            case 12: # Run code from case 13.
            case 13:

                foreach ($records as $key => $record) {

                    if ($record['attribute_status'] == 'converted') {
                        # Converted estimates are estimates that are archived.
                        # I can ignore them because they have a matching record in the Invoices export
                        # that will get imported by Pancake as an invoice.
                        unset($records[$key]);
                        continue;
                    }

                    $total = $record['attribute_total'];
                    $total_with_tax = $record['attribute_total_due'];
                    $date_entered = strtotime($record['attribute_created_at']);
                    $client = $CI->clients_m->fetch_details('', '', $record['client'], '');

                    # Who the crap uses "number" to describe an estimate's TITLE?
                    $estimate_title = $record['number'];
                    $description = $record['notes'];
                    $notes = $record['tags'];
                    $tax_percentage = (float) str_ireplace('%', '', $record['tax']);
                    $tax_id = Settings::get_tax($tax_percentage, 'Tax');
                    # Unused: $currency = $record['currency'];

                    $items = array(
                        'name' => array(),
                        'description' => array(),
                        'qty' => array(),
                        'rate' => array(),
                        'tax_id' => array(),
                        'total' => array(),
                        'name' => array(),
                    );

                    foreach ($record['lines'] as $item) {
                        $buffer = explode("\n", $item['name'], 2);
                        $items['name'][] = $buffer[0];
                        $items['description'][] = isset($buffer[1]) ? $buffer[1] : '';
                        $items['qty'][] = (float) $item['quantity'];
                        $items['rate'][] = (float) $item['unit_price'];
                        $items['tax_id'][] = $item['taxed'] == 'true' ? $tax_id : 0;
                        $items['total'][] = (float) $item['quantity'] * $item['unit_price'];
                    }

                    $records[$key] = array(
                        'client_id' => $client['id'],
                        'amount' => ($total_with_tax),
                        'amount_paid_so_far' => 0,
                        'is_new_client' => (isset($client['new_client']) and $client['new_client']),
                        'ask_for_currency' => false,
                        'due_date' => 0,
                        'invoice_number' => $estimate_title,
                        'notes' => $notes,
                        'type' => 'ESTIMATE',
                        'is_recurring' => 0,
                        'is_viewable' => 0,
                        'last_viewed' => 0,
                        'has_sent_notification' => 0,
                        'send_x_days_before' => 7,
                        'proposal_id' => 0,
                        'next_recur_date' => 0,
                        'last_sent' => ($record['attribute_status'] == 'closed') ? $date_entered : 0,
                        'project_id' => 0,
                        'currency_id' => 0,
                        'exchange_rate' => 1.00000,
                        'recur_id' => 0,
                        'auto_send' => 0,
                        'frequency' => 'm',
                        'is_paid' => 0,
                        'date_entered' => $date_entered,
                        'payment_date' => 0,
                        'description' => $description,
                        'invoice_item' => array(
                            'name' => $items['name'],
                            'qty' => $items['qty'],
                            'rate' => $items['rate'],
                            'tax_id' => $items['tax_id'],
                            'total' => $items['total'],
                            'description' => $items['description'],
                        )
                    );
                }

                return true;
                break;
            default:
                return false;
                break;
        }
    }

    function process_invoices_xml(&$fields, $records) {
        $CI = &get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('clients/clients_m');

        $invoice_xml_types = array(
            11 => array('attribute_status', 'attribute_created_at', 'attribute_total', 'attribute_total_due', 'attribute_uri', 'attribute_updated_at', 'attribute_name', 'attribute_due_date', 'client', 'number', 'tags', 'date', 'terms', 'currency')
        );

        $type = null;

        foreach ($invoice_xml_types as $key => $xml_type) {
            if ($fields == $xml_type) {
                $type = $key;
                break;
            }
        }

        switch ($type) {
            case 11:






                foreach ($records as $key => $record) {

                    $client = $CI->clients_m->fetch_details('', '', $record['attribute_name'], '');
                    $date_entered = strtotime($record['attribute_created_at']);
                    $invoice_number = $record['number'];
                    $due_date = strtotime($record['attribute_due_date']);
                    $is_paid = ($record['attribute_status'] == 'closed');
                    $total = (float) $record['attribute_total'];
                    $amount_paid_so_far = (float) ($record['attribute_total'] - $record['attribute_total_due']);
                    $payment_date = $is_paid ? strtotime($record['attribute_updated_at']) : 0;
                    $notes = $record['tags'];

                    $records[$key] = array(
                        'client_id' => $client['id'],
                        'amount' => ($total),
                        'amount_paid_so_far' => ($amount_paid_so_far > ($total)) ? ($total) : $amount_paid_so_far,
                        'is_new_client' => (isset($client['new_client']) and $client['new_client']),
                        'ask_for_currency' => false,
                        'due_date' => $due_date,
                        'invoice_number' => $invoice_number,
                        'notes' => '',
                        'type' => 'DETAILED',
                        'is_recurring' => 0,
                        'is_viewable' => 0,
                        'last_viewed' => 0,
                        'has_sent_notification' => 0,
                        'send_x_days_before' => 7,
                        'proposal_id' => 0,
                        'next_recur_date' => 0,
                        'last_sent' => ($record['attribute_status'] == 'closed') ? $date_entered : 0,
                        'project_id' => 0,
                        'currency_id' => 0,
                        'exchange_rate' => 1.00000,
                        'recur_id' => 0,
                        'auto_send' => 0,
                        'frequency' => 'm',
                        'is_paid' => $is_paid,
                        'date_entered' => $date_entered,
                        'payment_date' => $payment_date,
                        'description' => '',
                        'invoice_item' => array(
                            'name' => array($notes),
                            'qty' => array(1),
                            'rate' => array($total),
                            'tax_id' => array(0),
                            'total' => array($total),
                            'description' => array(''),
                        )
                    );
                }
                return true;
                break;
            default:
                return false;
                break;
        }
    }

    function process_invoices_txt(&$fields, &$records) {
        $CI = &get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('clients/clients_m');
        $CI->load->model('settings/tax_m');

        if ($fields == array('invoices', 'clients')) {
            $records = $records['invoices'];
            if (count($records) == 0) {
                $fields = array();
                return true;
            }
            $fields = array_keys(reset($records));
        }

        $invoice_txt_types = array(
            15 => array('id', 'client_id', 'invoice_number', 'dateIssued', 'payment_term', 'tax1_desc', 'tax1_rate', 'tax2_desc', 'tax2_rate', 'invoice_note', 'days_payment_due', 'name', 'amount_paid', 'daysOverdue', 'subtotal', 'items', 'payments'),
            16 => array('id', 'client_id', 'invoice_number', 'dateIssued', 'payment_term', 'tax1_desc', 'tax1_rate', 'tax2_desc', 'tax2_rate', 'invoice_note', 'days_payment_due', 'recur_interval', 'name', 'amount_paid', 'daysOverdue', 'subtotal', 'items', 'payments'),
            17 => array('id', 'client_id', 'invoiceNumber', 'dateIssued', 'tax1_desc', 'tax1_rate', 'tax2_desc', 'tax2_rate', 'invoice_note', 'name', 'amount_paid', 'daysOverdue', 'subtotal', 'items', 'payments'),
            18 => array('id', 'client_id', 'invoice_number', 'dateIssued', 'payment_term', 'tax1_desc', 'tax1_rate', 'tax2_desc', 'tax2_rate', 'invoice_note', 'days_payment_due', 'is_campana', 'name', 'amount_paid', 'daysOverdue', 'subtotal', 'items', 'payments'),
            19 => array('id', 'client_id', 'invoice_number', 'dateIssued', 'tax1_desc', 'tax1_rate', 'tax2_desc', 'tax2_rate', 'invoice_note', 'days_payment_due', 'name', 'amount_paid', 'daysOverdue', 'subtotal', 'items', 'payments'),
            20 => array('id', 'client_id', 'invoiceNumber', 'dateIssued', 'amount', 'work_description', 'tax1_desc', 'tax1_rate', 'tax2_desc', 'tax2_rate', 'invoice_note', 'itemized', 'subtotal', 'name', 'amount_paid', 'daysOverdue', 'payments'),
            21 => array('id', 'client_id', 'invoice_number', 'dateIssued', 'payment_term', 'tax1_desc', 'tax1_rate', 'tax2_desc', 'tax2_rate', 'invoice_note', 'name', 'amount_paid', 'daysOverdue', 'subtotal', 'items', 'payments'),
        );

        $type = null;

        foreach ($invoice_txt_types as $key => $txt_type) {
            if ($fields == $txt_type) {
                $type = $key;
                break;
            }
        }

        switch ($type) {
            case 15:
            case 16:
            case 17:
            case 18:
            case 19:
            case 20:
            case 21:
                $new_records = array();
                foreach ($records as $key => $record) {

                    if (isset($record['invoiceNumber'])) {
                        $record['invoice_number'] = $record['invoiceNumber'];
                    }

                    $client = $CI->clients_m->fetch_details($record['client_id']);

                    $tax_1 = $record['tax1_rate'] != 0 ? $CI->tax_m->create_if_not_exists($record['tax1_rate'], $record['tax1_desc']) : null;
                    $tax_2 = $record['tax2_rate'] != 0 ? $CI->tax_m->create_if_not_exists($record['tax2_rate'], $record['tax2_desc']) : null;
                    $tax_ids = array();
                    if ($tax_1) {
                        $tax_ids[$tax_1] = $tax_1;
                    }

                    if ($tax_2) {
                        $tax_ids[$tax_2] = $tax_2;
                    }

                    if ($record["dateIssued"] === "0000-00-00") {
                        $date_entered = now()->timestamp;
                        $due_date = 0;
                    } else {
                        $date_entered = strtotime($record["dateIssued"]);
                        if (isset($record["days_payment_due"])) {
                            $due_date = strtotime("+{$record["days_payment_due"]} days", $date_entered);
                        } else {
                            $due_date = $date_entered;
                        }
                    }

                    $subtotal = 0;
                    $items = array();

                    if (isset($record['items'])) {
                        foreach ($record['items'] as $key => $item) {
                            $subtotal += ($item['amount'] * $item['quantity']);

                            # Use the work_description as the item's name if and only if it is short enough and has no linebreaks.
                            $is_name_too_long = (strlen($item["work_description"]) > 200 or stristr($item["work_description"], "\n") !== false);

                            $items[] = array(
                                "name" => $is_name_too_long ? "#" . ($key + 1) : $item["work_description"],
                                "description" => $is_name_too_long ? $item["work_description"] : "",
                                "qty" => $item["quantity"],
                                "rate" => $item["amount"],
                                "total" => ($item["quantity"] * $item["amount"]),
                                "discount_is_percentage" => 0,
                                "discount" => 0,
                                "type" => "standard",
                                "tax_ids" => $item["taxable"] ? $tax_ids : array(),
                            );
                        }
                    } else {
                        $subtotal += $record['amount'];

                        # Use the work_description as the item's name if and only if it is short enough and has no linebreaks.
                        $is_name_too_long = (strlen($record["work_description"]) > 200 or stristr($record["work_description"], "\n") !== false);

                        $items[] = array(
                            "name" => $is_name_too_long ? "#" . ($key + 1) : $record["work_description"],
                            "description" => $is_name_too_long ? $record["work_description"] : "",
                            "qty" => 1,
                            "rate" => $record["amount"],
                            "total" => $record["amount"],
                            "discount_is_percentage" => 0,
                            "discount" => 0,
                            "type" => "flat_rate",
                            "tax_ids" => $tax_ids,
                        );
                    }

                    $update_keys = false;
                    $last_payment_date = 0;
                    $key = 1;
                    $payments = array();
                    foreach ($record['payments'] as $payment) {
                        $date_paid = strtotime($payment['date_paid']);
                        if ($date_paid > $last_payment_date) {
                            $last_payment_date = $date_paid;
                        }

                        if ($payment["amount_paid"] > 0) {
                            $payments[] = array(
                                'due_date' => $due_date,
                                'payment_date' => $date_paid,
                                'payment_status' => "Completed",
                                'payment_method' => "cash_m",
                                'key' => $key,
                                'payment_gross' => $payment["amount_paid"],
                                'amount' => $payment["amount_paid"],
                                'notes' => ($payment["payment_note"] === "0" ? "" : $payment["payment_note"]),
                                'is_paid' => 1,
                            );
                        } elseif ($payment["amount_paid"] < 0) {
                            if (stristr($payment["payment_note"], "Reversal") !== false || stristr($payment["payment_note"], "Incorrect") !== false) {

                                foreach ($payments as $key_of_payment => $possible_mirror_payment) {
                                    if ($possible_mirror_payment["amount"] == abs($payment["amount_paid"])) {
                                        # Remove this payment because it's been undone by an equal negative payment.
                                        unset($payments[$key_of_payment]);
                                        $update_keys = true;
                                    }
                                }

                            } else {
                                throw_exception("Unexpected negative payment amount!", $payments, $payment, $record, $items);
                            }
                        }

                        $key++;
                    }

                    if ($update_keys) {
                        $payment_key = 1;
                        foreach ($payments as $i_key => $payment) {
                            $payments[$i_key]["key"] = $payment_key;
                            $payment_key++;
                        }
                    }

                    $new_records[] = array(
                        "format_v2" => true, # This is here to tell the system to use the new format for items/parts/tax_ids/etc.
                        "client_id" => $client["id"],
                        "amount" => $subtotal,
                        "due_date" => $due_date,
                        "invoice_number" => $record["invoice_number"],
                        "notes" => $record["invoice_note"],
                        "payment_date" => $last_payment_date,
                        "type" => "DETAILED",
                        "date_entered" => $date_entered,
                        "is_paid" => ($record["amount_paid"] == $record["subtotal"]),
                        "send_x_days_before" => Settings::get("send_x_days_before"),
                        "owner_id" => current_user(),
                        "items" => $items,
                        "parts" => $payments
                    );
                }

                $records = $new_records;

                return true;
                break;
            default:
                return false;
                break;
        }
    }

    function process_invoices_json(&$fields, $records) {

        $CI = &get_instance();
        $CI->load->model('invoices/invoice_m');

        $invoice_json_types = array(
            'pancake' => array(0 => 'id', 1 => 'unique_id', 2 => 'client_id', 3 => 'amount', 4 => 'due_date', 5 => 'invoice_number', 6 => 'notes', 7 => 'description', 8 => 'txn_id', 9 => 'payment_gross', 10 => 'item_name', 11 => 'payment_hash', 12 => 'payment_status', 13 => 'payment_type', 14 => 'payment_date', 15 => 'payer_status', 16 => 'type', 17 => 'date_entered', 18 => 'is_paid', 19 => 'is_recurring', 20 => 'frequency', 21 => 'auto_send', 22 => 'recur_id', 23 => 'currency_id', 24 => 'exchange_rate', 25 => 'project_id', 26 => 'last_sent', 27 => 'next_recur_date', 28 => 'proposal_id', 29 => 'send_x_days_before', 30 => 'has_sent_notification', 31 => 'last_viewed', 32 => 'is_viewable', 33 => 'partial_payments', 34 => 'invoice_rows',)
        );

        $type = null;

        foreach ($invoice_json_types as $key => $json_type) {
            if ($fields == $json_type) {
                $type = $key;
                break;
            }
        }

        switch ($type) {
            case 'pancake':
                foreach ($records as $key => $record) {
                    $records[$key]['original_from_pancake'] = true;
                }
                return true;
            default:
                return false;
        }
    }

    function process_invoices_iif(&$fields, &$records) {
        $known_format = array('TRNSTYPE', 'DATE', 'ACCNT', 'AMOUNT', 'DOCNUM', 'MEMO', 'TERMS', 'PONUM', 'INVTITLE', 'CLIENT', 'ITEMS');

        if ($known_format == $fields) {
            $new_records = array();
            foreach ($records as $record) {

                foreach ($record["ITEMS"] as $item) {
                    if ($item["EXTRA"] == "AUTOSTAX" and $item["AMOUNT"] > 0) {
                        debug("Tax handling has not yet been implemented, and this file was found to have tax data.", $record);
                    }
                }

                if (stristr($record["MEMO"], "[VOID Invoice") !== false) {
                    # Ignore void invoices.
                    continue;
                }

                $client = $this->clients_m->fetch_details($record["CLIENT"]["FIRSTNAME"], $record["CLIENT"]["LASTNAME"], $record["CLIENT"]["COMPANYNAME"], $record["CLIENT"]["EMAIL"], array(
                    "phone" => $record["CLIENT"]["PHONE1"],
                    "fax" => $record["CLIENT"]["FAXNUM"],
                    "address" => "{$record["CLIENT"]["BADDR1"]}\n{$record["CLIENT"]["BADDR2"]}\n{$record["CLIENT"]["BADDR4"]}\n{$record["CLIENT"]["BADDR5"]}",
                    "profile" => "Job Type: {$record["CLIENT"]["JOBTYPE"]}\nJob Description: {$record["CLIENT"]["JOBDESC"]}"
                ));
                $date = explode("/", $record["DATE"]);
                $date = strtotime("{$date[2]}-{$date[0]}-{$date[1]}");

                $payment = $record["MEMO"];
                $payments = array();
                if (!empty($payment)) {
                    if (stristr($payment, "[Exempt] Payments Received:") !== false) {
                        $payment = abs((float) str_ireplace("[Exempt] Payments Received:", "", $payment));
                        if ($payment == $record["AMOUNT"]) {
                            $is_paid = true;
                            $last_payment_date = $date;

                            $payments[] = array(
                                'due_date' => $date,
                                'payment_date' => $date,
                                'payment_status' => "Completed",
                                'payment_method' => "cash_m",
                                'key' => 1,
                                'payment_gross' => $payment,
                                'amount' => $payment,
                                'notes' => $record["MEMO"],
                                'is_paid' => 1,
                            );
                        } else {
                            $is_paid = false;
                            $last_payment_date = null;
                            $remainder = $record["AMOUNT"] - $payment;

                            if ($payment > 0) {
                                $payments[] = array(
                                    'due_date' => $date,
                                    'payment_date' => $date,
                                    'payment_status' => "Completed",
                                    'payment_method' => "cash_m",
                                    'key' => 1,
                                    'payment_gross' => $payment,
                                    'amount' => $payment,
                                    'notes' => $record["MEMO"],
                                    'is_paid' => 1,
                                );

                                $payments[] = array(
                                    'due_date' => $date,
                                    'payment_date' => 0,
                                    'payment_status' => "Completed",
                                    'payment_method' => "cash_m",
                                    'key' => 2,
                                    'payment_gross' => $remainder,
                                    'amount' => $remainder,
                                    'notes' => "",
                                    'is_paid' => 0,
                                );
                            }
                        }
                    } else {
                        debug("Didn't find a valid MEMO for this invoice.", $record);
                    }
                } else {
                    $is_paid = false;
                    $last_payment_date = null;
                }

                $items = array();
                foreach ($record['ITEMS'] as $item) {
                    if ($item["EXTRA"] != "AUTOSTAX") {
                        $amount = abs((float) $item["AMOUNT"]);
                        if ($amount > 0) {
                            $items[] = array(
                                "name" => $item["INVITEM"],
                                "description" => "",
                                "qty" => 1,
                                "rate" => $amount,
                                "total" => $amount,
                                "type" => "standard",
                                "tax_ids" => array(),
                            );
                        }
                    }
                }

                $new_records[] = array(
                    "format_v2" => true, # This is here to tell the system to use the new format for items/parts/tax_ids/etc.
                    "client_id" => $client["id"],
                    "amount" => $record["AMOUNT"],
                    "due_date" => $date,
                    "invoice_number" => $record["DOCNUM"],
                    "description" => $record["INVTITLE"],
                    "notes" => $record["TERMS"],
                    "payment_date" => $last_payment_date,
                    "type" => "DETAILED",
                    "date_entered" => $date,
                    "is_paid" => $is_paid,
                    "send_x_days_before" => Settings::get("send_x_days_before"),
                    "owner_id" => current_user(),
                    "items" => $items,
                    "parts" => $payments
                );
            }
            $records = $new_records;
            return true;
        }

        # Didn't find a valid format.
        return false;
    }

    function process_invoices_csv(&$fields, &$records) {

        $CI = &get_instance();
        $CI->load->model('invoices/invoice_m');
        $CI->load->model('clients/clients_m');

        # Detect invoices CSV.

        $invoice_csv_types = array(
            16 => array('invoice_number', 'organization', 'fname', 'lname', 'amount', 'paid', 'po_number', 'create_date', 'date_paid', 'terms', 'notes'),
            17 => array('id', 'ref', 'uri', 'title', 'po_number', 'description', 'footer', 'client_id', 'client_name', 'project_id', 'date', 'date_due', 'date_paid', 'currency', 'terms', 'custom_date', 'discount_rate', 'tax_rate', 'payments', 'discount', 'tax', 'subtotal', 'total', 'paid', 'public', 'payment', 'sent', 'recurring', 'autosend', 'frequency', 'last_sent', 'draft', 'archived', 'date_created', 'user_id', 'items'),
            18 => array('id', 'currency', 'issued_on', 'note', 'state', 'summary', 'total', 'subtotal', 'tax_due', 'total_discount', 'client_name', 'number', 'due_on', 'paid_in', 'paid_on'),
            19 => array('Date', 'Invoice No', 'Client', 'Due Date', 'State', 'Sub Total', 'Discount', 'Sales Tax', 'Tax 2', 'Paid Total', 'Total Due', 'Paid On', 'Summary'),
            20 => array('Date', 'Invoice No', 'Client', 'Due Date', 'State', 'Sub Total', 'Discount', 'Tax', 'Tax 2', 'Paid Total', 'Total Due', 'Paid On', 'Summary'),
        );

        $type = null;

        foreach ($invoice_csv_types as $key => $csv_type) {
            if ($fields == $csv_type) {
                $type = $key;
                break;
            }
        }

        switch ($type) {
            case 16:

                foreach ($records as $key => $record) {
                    $client = $CI->clients_m->fetch_details($record['fname'], $record['lname'], $record['organization'], '');
                    $records[$key] = array(
                        'client_id' => $client['id'],
                        'amount' => $record['amount'],
                        'amount_paid_so_far' => $record['paid'],
                        'is_new_client' => (isset($client['new_client']) and $client['new_client']),
                        'ask_for_currency' => true,
                        'due_date' => 0,
                        'invoice_number' => $record['invoice_number'],
                        'notes' => $record['terms'],
                        'type' => 'DETAILED',
                        'is_recurring' => 0,
                        'is_viewable' => 0,
                        'last_viewed' => 0,
                        'has_sent_notification' => 0,
                        'send_x_days_before' => 7,
                        'proposal_id' => 0,
                        'next_recur_date' => 0,
                        'last_sent' => 0,
                        'project_id' => 0,
                        'currency_id' => 0,
                        'exchange_rate' => 1.00000,
                        'recur_id' => 0,
                        'auto_send' => 0,
                        'frequency' => 'm',
                        'is_paid' => (int) ($record['date_paid'] != '0000-00-00 00:00:00'),
                        'date_entered' => $record['create_date'] == '0000-00-00 00:00:00' ? 0 : strtotime($record['create_date']),
                        'payment_date' => $record['date_paid'] == '0000-00-00 00:00:00' ? 0 : strtotime($record['date_paid']),
                        'description' => '',
                        'invoice_item' => array(
                            'name' => array('Invoice'),
                            'qty' => array(1),
                            'rate' => array($record['amount']),
                            'tax_id' => array(0),
                            'total' => array($record['amount']),
                            'description' => array(''),
                        )
                    );
                }

                return true;
                break;
            case 17:
                foreach ($records as $key => $record) {

                    if (!isset($record['client_name'])) {
                        unset($records[$key]);
                        continue;
                    }

                    /**
                     * Ignored:
                      'currency' => 'USD',
                      'discount_rate' => '0',
                      'tax_rate' => '',
                      'discount' => '0',
                      'tax' => '0',
                      'subtotal' => '75',
                     */
                    $client_name = explode(' ', $record['client_name'], 2);
                    $client = $CI->clients_m->fetch_details($client_name[0], isset($client_name[1]) ? $client_name[1] : ' ', '', '');
                    $records[$key] = array(
                        'client_id' => $client['id'],
                        'amount' => $record['total'],
                        'amount_paid_so_far' => ($record['paid'] ? $record['total'] : $record['payments']),
                        'is_new_client' => (isset($client['new_client']) and $client['new_client']),
                        'ask_for_currency' => false,
                        'due_date' => $record['date_due'] == '0000-00-00 00:00:00' ? 0 : strtotime($record['date_due']),
                        'invoice_number' => $record['ref'],
                        'notes' => $record['footer'],
                        'type' => 'DETAILED',
                        'is_recurring' => $record['recurring'],
                        'is_viewable' => 0,
                        'last_viewed' => 0,
                        'has_sent_notification' => 0,
                        'send_x_days_before' => 7,
                        'proposal_id' => 0,
                        'next_recur_date' => 0,
                        'last_sent' => $record['last_sent'] == '0000-00-00 00:00:00' ? 0 : strtotime($record['last_sent']),
                        'project_id' => 0,
                        'currency_id' => 0,
                        'exchange_rate' => 1.00000,
                        'recur_id' => 0,
                        'auto_send' => $record['autosend'],
                        'frequency' => strtolower($record['frequency']),
                        'is_paid' => $record['paid'],
                        'date_entered' => $record['date'] == '0000-00-00 00:00:00' ? 0 : strtotime($record['date']),
                        'payment_date' => $record['date_paid'] == '0000-00-00 00:00:00' ? 0 : strtotime($record['date_paid']),
                        'description' => $record['description'],
                        'invoice_item' => array(
                            'name' => array('Invoice'),
                            'qty' => array(1),
                            'rate' => array($record['total']),
                            'tax_id' => array(0),
                            'total' => array($record['total']),
                            'description' => array(''),
                        )
                    );
                }
                return true;
                break;
            case 18:
                foreach ($records as $key => $record) {

                    $client_name = explode(' ', $record['client_name'], 2);

                    $record['paid_on'] = str_ireplace('/', '-', $record['paid_on']);
                    $record['due_on'] = str_ireplace('/', '-', $record['due_on']);
                    $record['issued_on'] = str_ireplace('/', '-', $record['issued_on']);

                    $client = $CI->clients_m->fetch_details($client_name[0], isset($client_name[1]) ? $client_name[1] : ' ', '', '');
                    $records[$key] = array(
                        'client_id' => $client['id'],
                        'amount' => $record['total'],
                        'amount_paid_so_far' => !empty($record['paid_on']) ? $record['total'] : 0,
                        'is_new_client' => (isset($client['new_client']) and $client['new_client']),
                        'ask_for_currency' => false,
                        'due_date' => strtotime($record['due_on']),
                        'invoice_number' => $record['number'],
                        'notes' => $record['note'],
                        'type' => 'DETAILED',
                        'is_recurring' => 0,
                        'is_viewable' => 0,
                        'last_viewed' => 0,
                        'has_sent_notification' => 0,
                        'send_x_days_before' => 7,
                        'proposal_id' => 0,
                        'next_recur_date' => 0,
                        'last_sent' => ($record['state'] == 'closed' or $record['state'] == 'sent') ? strtotime($record['issued_on']) : 0,
                        'project_id' => 0,
                        'currency_id' => 0,
                        'exchange_rate' => 1.00000,
                        'recur_id' => 0,
                        'auto_send' => 0,
                        'frequency' => 'm',
                        'is_paid' => !empty($record['paid_on']),
                        'date_entered' => strtotime($record['issued_on']),
                        'payment_date' => (!empty($record['paid_on']) ? strtotime($record['paid_on']) : 0),
                        'description' => $record['summary'],
                        'invoice_item' => array(
                            'name' => array('Invoice'),
                            'qty' => array(1),
                            'rate' => array($record['total']),
                            'tax_id' => array(0),
                            'total' => array($record['total']),
                            'description' => array(''),
                        )
                    );
                }
                return true;
                break;
            case 19:
            case 20:
                foreach ($records as $key => $record) {

                    if ($type == 20) {

                        if (!isset($record['Tax'])) {
                            if (array('Date') == array_keys($record)) {
                                unset($records[$key]);
                                continue;
                            }
                        }

                        $record['Sales Tax'] = $record['Tax'];
                        unset($record['Tax']);
                    }

                    $client_name = explode(' ', $record['Client'], 2);
                    $client = $CI->clients_m->fetch_details($client_name[0], isset($client_name[1]) ? $client_name[1] : ' ', '', '');

                    $date_entered = strtotime($record['Date']);
                    $invoice_number = $record['Invoice No'];
                    $due_date = strtotime($record['Due Date']);
                    $is_paid = ($record['State'] == 'closed' or $record['State'] == 'paid');
                    $total = (float) str_ireplace(array('$', ','), '', $record['Sub Total']);
                    $sales_tax = (float) str_ireplace(array('$', ','), '', $record['Sales Tax']);
                    $tax_id = $total > 0 ? Settings::get_tax((($sales_tax / $total) * 100), 'Sales Tax') : 0;
                    $amount_paid_so_far = (float) str_ireplace(array('$', ','), '', $record['Paid Total']);
                    $payment_date = strtotime(str_ireplace('-', '/', $record['Paid On']));
                    $notes = $record['Summary'];

                    $records[$key] = array(
                        'client_id' => $client['id'],
                        'amount' => ($total + $sales_tax),
                        'amount_paid_so_far' => ($amount_paid_so_far > ($total + $sales_tax)) ? ($total + $sales_tax) : $amount_paid_so_far,
                        'is_new_client' => (isset($client['new_client']) and $client['new_client']),
                        'ask_for_currency' => false,
                        'due_date' => $due_date,
                        'invoice_number' => $invoice_number,
                        'notes' => '',
                        'type' => 'DETAILED',
                        'is_recurring' => 0,
                        'is_viewable' => 0,
                        'last_viewed' => 0,
                        'has_sent_notification' => 0,
                        'send_x_days_before' => 7,
                        'proposal_id' => 0,
                        'next_recur_date' => 0,
                        'last_sent' => ($record['State'] == 'closed' or $record['State'] == 'sent' or $record['State'] == 'viewed' or $record['State'] == 'partially_paid') ? $date_entered : 0,
                        'project_id' => 0,
                        'currency_id' => 0,
                        'exchange_rate' => 1.00000,
                        'recur_id' => 0,
                        'auto_send' => 0,
                        'frequency' => 'm',
                        'is_paid' => $is_paid,
                        'date_entered' => $date_entered,
                        'payment_date' => $payment_date,
                        'description' => '',
                        'invoice_item' => array(
                            'name' => array($notes),
                            'qty' => array(1),
                            'rate' => array($total),
                            'tax_id' => array($tax_id),
                            'total' => array($total),
                            'description' => array(''),
                        )
                    );
                }

                return true;
                break;
            default:
                return false;
                break;
        }
    }

    function process_clients_txt(&$fields, &$records) {
        $CI = &get_instance();
        $CI->load->model('clients/clients_m');

        if ($fields == array('invoices', 'clients')) {
            $fields = array_keys(reset($records['clients']));
            $records = $records['clients'];
            return $this->process_clients_txt($fields, $records);
        }

        $bamboo = array(
            array('id', 'name', 'address1', 'address2', 'city', 'province', 'country', 'postal_code', 'website', 'tax_status', 'client_notes', 'tax_code', 'contacts'),
            array('id', 'name', 'address1', 'address2', 'city', 'province', 'country', 'postal_code', 'website', 'tax_status', 'contacts'),
            array('id', 'name', 'address1', 'address2', 'city', 'province', 'country', 'postal_code', 'website', 'tax_status', 'client_notes', 'contacts')
        );

        if (in_array($fields, $bamboo)) {
            foreach ($records as $key => $client) {
                $first_name = "";
                $last_name = "";
                $email = Business::getNotifyEmail();
                $phone = "";

                if (!empty($client['contacts'])) {
                    $contact = reset($client['contacts']);
                    $first_name = $contact["first_name"];
                    $last_name = $contact["last_name"];
                    $email = $contact["email"];
                    $phone = $contact["phone"];
                }

                $address = $client['address1'] . "\n";
                if (!empty($client['address2'])) {
                    $address .= $client['address2'] . "\n";
                }
                $address .= $client['city'] . ', ' . $client['province'] . ' ' . $client['postal_code'] . "\n";
                $address .= $client['country'];

                $records[$key] = array(
                    'first_name' => $first_name,
                    'last_name' => $last_name,
                    'email' => $email,
                    'company' => $client["name"],
                    'address' => $address,
                    'phone' => $phone,
                    'website' => $client["website"],
                    'profile' => (isset($client["client_notes"]) ? $client["client_notes"] . " " : "") . '[ORIGINAL_CLIENT_ID=' . $client['id'] . ']'
                );
            }
            return true;
        }
    }

    function process_clients_xml(&$fields, &$records) {

        $CI = &get_instance();
        $CI->load->model('clients/clients_m');

        $types = array(
            10 => array('attribute_uri', 'attribute_created_at', 'attribute_updated_at', 'name', 'address1', 'address2', 'city', 'state', 'zip', 'country', 'url', 'phone', 'fax', 'people'),
            11 => array('attribute_created_at', 'attribute_uri', 'attribute_updated_at', 'name', 'address1', 'address2', 'city', 'state', 'zip', 'country', 'url', 'phone', 'fax', 'people'),
            "proprofs_clients" => array('client_id', 'client_name', 'contact_id', 'email', 'tel', 'fax', 'mobile', 'website', 'address', 'city', 'state', 'postcode', 'country', 'notes', 'background', 'active', 'group', 'date_created', 'date_modified', 'user_id'),
            "proprofs_contacts" => array('contact_id', 'contact_name', 'email', 'tel', 'fax', 'mobile', 'role', 'company_name', 'group', 'client_id', 'client_name', 'date_created', 'date_modified', 'user_id'),
        );

        $type = "0";

        foreach ($types as $key => $type_buffer) {
            if ($fields == $type_buffer) {
                $type = $key;
                break;
            }
        }

        switch ($type) {
            case 10: # Run code from case 11.
            case 11:
                foreach ($records as $key => $record) {

                    if (!isset($record['people']['first_name']) and isset($record['people'][0])) {
                        $record['people'] = reset($record['people']);
                    }

                    $records[$key] = array(
                        'first_name' => $record['people']['first_name'],
                        'last_name' => $record['people']['last_name'],
                        'title' => '',
                        'email' => empty($record['people']['email']) ? Business::getNotifyEmail() : $record['people']['email'],
                        'company' => $record['name'],
                        'address' => trim(str_ireplace("\n\n", '', $record['address1'] . "\n" . $record['address2'] . "\n" . $record['city'] . "\n" . $record['state'] . "\n" . $record['zip'] . "\n" . $record['country'])),
                        'phone' => $record['phone'],
                        'fax' => $record['fax'],
                        'mobile' => $record['people']['phone_mobile'],
                        'website' => $record['url'],
                        'created' => date('Y-m-d H:i:s', strtotime($record['attribute_created_at'])),
                        'modified' => date('Y-m-d H:i:s', strtotime($record['attribute_updated_at'])),
                        'profile' => '',
                    );
                }

                return true;
                break;
            case "proprofs_clients":
                foreach ($records as $key => $record) {
                    $notes = [$record["notes"], $record["background"], '[ORIGINAL_CLIENT_ID=' . $record['client_id'] . ']'];
                    $notes = array_filter($notes, function ($value) {
                        return !empty(trim($value));
                    });
                    $notes = implode("\n", $notes);

                    $address = [];
                    foreach (["address", "city", "state", "postcode", "country"] as $var) {
                        if (!empty(trim($record[$var]))) {
                            $address[] = trim($record[$var]);
                        }
                    }

                    $address = implode(",\n", $address);

                    $records[$key] = [
                        "company" => "",
                        "first_name" => "",
                        "last_name" => "",
                        'email' => $record["email"] ? $record["email"] : Business::getNotifyEmail(),
                        'address' => $address,
                        'phone' => $record["tel"],
                        'fax' => $record["fax"],
                        'mobile' => $record["mobile"],
                        'website' => $record["website"],
                        'created' => carbon($record['date_created'])->toDateTimeString(),
                        'modified' => carbon($record['date_modified'])->toDateTimeString(),
                        'profile' => $notes,
                    ];

                    if ($record["contact_id"]) {
                        $records[$key]["company"] = $record["client_name"];
                    } else {
                        $name = explode(" ", $record["client_name"]);
                        $first_name = $name[0];
                        unset($name[0]);
                        $last_name = implode(" ", $name);
                        $records[$key]["first_name"] = $first_name;
                        $records[$key]["last_name"] = $last_name;
                    }
                }

                return true;
                break;
            case "proprofs_contacts":
                $updated = 0;

                $new_records = [];

                foreach ($records as $key => $record) {
                    $client = $this->clients_m->where("profile like", "%[ORIGINAL_CLIENT_ID={$record["client_id"]}]%")->get_all();

                    $name = explode(" ", $record["contact_name"]);
                    $first_name = $name[0];
                    unset($name[0]);
                    $last_name = implode(" ", $name);

                    if (count($client) == 0) {
                        $new_records[] = [
                            "company" => $record["client_name"],
                            "first_name" => $first_name,
                            "last_name" => $last_name,
                            'email' => $record["email"] ? $record["email"] : Business::getNotifyEmail(),
                            'address' => "",
                            'phone' => $record["tel"],
                            'fax' => $record["fax"],
                            'mobile' => $record["mobile"],
                            'website' => "",
                            'created' => carbon($record['date_created'])->toDateTimeString(),
                            'modified' => carbon($record['date_modified'])->toDateTimeString(),
                            'profile' => '[ORIGINAL_CLIENT_ID=' . $record['client_id'] . ']',
                        ];
                    } else {
                        $client = (array) $client[0];

                        $data = [
                            "first_name" => $first_name,
                            "last_name" => $last_name,
                        ];

                        $client_has_email = ($client["email"] && $client["email"] != Business::getNotifyEmail());
                        if ($record["email"] && !$client_has_email) {
                            $data["email"] = $record["email"];
                        }

                        if ($record["tel"] && !$client["phone"]) {
                            $data["phone"] = $record["tel"];
                        }

                        if ($record["fax"] && !$client["fax"]) {
                            $data["fax"] = $record["fax"];
                        }

                        if ($record["mobile"] && !$client["mobile"]) {
                            $data["mobile"] = $record["mobile"];
                        }

                        $this->clients_m->update($client["id"], $data, true);
                        $updated++;
                    }
                }

                $records = $new_records;
                return true;
                break;
            default:
                return false;
                break;
        }
    }

    function process_clients_csv(&$fields, &$records) {

        $CI = &get_instance();
        $CI->load->model('clients/clients_m');

        # Detect clients CSV.

        if ($fields == array('Account Name', 'Phone', 'Fax', 'Website', 'Date Signed',
            'Email Address', 'Cell Phone', 'Contact Person', 'Billing Street', 'Shipping Street',
            'Billing City', 'Shipping City', 'Billing State', 'Shipping State', 'Billing Code', 'Shipping Code')) {
            foreach ($records as $key => $client) {
                $name = explode(' ', $client['Contact Person'], 2);
                $first_name = $name[0];
                $last_name = isset($name[1]) ? $name[1] : '';
                if (empty($first_name)) {
                    $first_name = 'NO FIRST NAME';
                }

                if (empty($last_name)) {
                    $last_name = 'NO LAST NAME';
                }

                $records[$key] = array(
                    'first_name' => $first_name,
                    'last_name' => $last_name,
                    'title' => '',
                    'email' => (empty($client['Email Address']) or $client['Email Address'] == 'No Email') ? Business::getNotifyEmail() : $client['Email Address'],
                    'company' => $client['Account Name'],
                    'address' => $client['Billing Street'] . "\r\n" . $client['Billing City'] . "\r\n" . $client['Billing State'],
                    'phone' => $client['Phone'],
                    'fax' => $client['Fax'],
                    'mobile' => $client['Cell Phone'],
                    'website' => $client['Website'],
                    'created' => date('Y-m-d H:i:s', empty($client['Date Signed']) ? time() : strtotime($client['Date Signed'])),
                    'modified' => date('Y-m-d H:i:s', time()),
                    'profile' => '',
                );
            }

            return true;
        } elseif ($fields == array('Organization', 'FirstName', 'LastName', 'Email', 'Street', 'Street2', 'City', 'Province', 'Country', 'PostalCode', 'BusPhone', 'HomePhone', 'MobPhone', 'Fax', 'SecStreet', 'SecStreet2', 'SecCity', 'SecProvince', 'SecCountry', 'SecPostalCode', 'Notes')) {

            foreach ($records as $key => $record) {
                $records[$key] = array(
                    'first_name' => $record['FirstName'],
                    'last_name' => $record['LastName'],
                    'title' => '',
                    'email' => $record['Email'],
                    'company' => $record['Organization'],
                    'address' => trim(str_ireplace("\r\n\r\n", "\r\n", str_ireplace("\r\n\r\n", "\r\n", str_ireplace("\r\n\r\n", "\r\n", $record['Street'] . "\r\n" . $record['Street2'] . "\r\n" . $record['City'] . "\r\n" . $record['Province'] . "\r\n" . $record['PostalCode'] . "\r\n" . $record['Country'])))),
                    'phone' => $record['BusPhone'],
                    'fax' => $record['Fax'],
                    'mobile' => $record['MobPhone'],
                    'website' => '',
                    'created' => date('Y-m-d H:i:s', time()),
                    'modified' => date('Y-m-d H:i:s', time()),
                    'profile' => $record['Notes'],
                );
            }

            return true;
        } elseif ($fields == array('id', 'client_name', 'email', 'tel', 'website', 'address', 'contact_id', 'notes', 'date_created', 'user_id')) {

            foreach ($records as $key => $record) {

                if (!isset($record['client_name'])) {
                    unset($records[$key]);
                    continue;
                }

                $records[$key] = array(
                    'first_name' => $record['client_name'],
                    'last_name' => '',
                    'title' => '',
                    'email' => empty($record['email']) ? Business::getNotifyEmail() : $record['email'],
                    'company' => '',
                    'address' => $record['address'],
                    'phone' => $record['tel'],
                    'fax' => '',
                    'mobile' => '',
                    'website' => $record['website'],
                    'created' => $record['date_created'],
                    'modified' => date('Y-m-d H:i:s', time()),
                    'profile' => $record['notes'],
                );
            }

            return true;
        } elseif ($fields == array('Name', 'Email', 'Address 1', 'City', 'State', 'Zip Code', 'Country', 'Phone', 'Fax', 'Currency', 'Custom Field Name', 'Custom Field Value',
                )) {

            foreach ($records as $key => $record) {

                if (!isset($client['Address 1'])) {
                    if (array('Name') == array_keys($record)) {
                        unset($records[$key]);
                        continue;
                    }
                }

                $client_name = explode(' ', $record['Name'], 2);
                $first = $client_name[0];
                $last = isset($client_name[1]) ? $client_name[1] : ' ';

                $records[$key] = array(
                    'first_name' => $first,
                    'last_name' => $last,
                    'title' => '',
                    'email' => empty($record['Email']) ? Business::getNotifyEmail() : $record['Email'],
                    'company' => '',
                    'address' => $record['Address 1'] . "\n" . $record['City'] . "\n" . $record['State'] . "\n" . $record['Zip Code'] . "\n" . $record['Country'],
                    'phone' => $record['Phone'],
                    'fax' => $record['Fax'],
                    'mobile' => '',
                    'website' => '',
                    'created' => date('Y-m-d H:i:s', time()),
                    'modified' => date('Y-m-d H:i:s', time()),
                    'profile' => $record['Custom Field Name'] . ": " . $record['Custom Field Value'],
                );
            }

            return true;
        } else {
            return false;
        }
    }

    function import($type, $filename, $ext) {
        if (function_exists("set_time_limit") && @ini_get("safe_mode") == 0) {
            @set_time_limit(0);
        }

        $CI = &get_instance();
        $CI->load->model('clients/clients_m');
        $CI->load->model('projects/project_time_m');
        $CI->db->save_queries = false;
        $return = array();

        if ($type == "invoices" and $ext == "txt") {
            # This is bamboo, let's import clients first and then import invoices.
            $buffer = $this->import("clients", $filename, $ext);
            $return["clients"] = $buffer["clients"];
        }

        if ($type == "invoices" and $ext == "iif") {
            # This is qb, let's import clients first and then import invoices.
            $buffer = $this->import("clients", $filename, $ext);
            $return["clients"] = $buffer["clients"];
        }

        # Process the file and return arrays with the records.
        $import = $this->prepare_import($type, $filename, $ext);

        if (!$import) {
            return false;
        }

        switch ($type) {
            case 'time_entries':
                $count = 0;
                $dupes = 0;


                foreach ($import['records'] as $record) {
                    $CI->project_time_m->insert_hours($record['project_id'], $record['date'], $record['hours'], $record['task_id'], $record['notes']);
                    $count++;
                }

                break;
            case 'clients':
                $count = 0;
                $dupes = 0;
                foreach ($import['records'] as $record) {

                    if ($CI->clients_m->find_client($record['company'], $record['first_name'], $record['last_name'])) {
                        $dupes++;
                    } else {
                        if (!$CI->clients_m->insert($record)) {
                            debug(validation_errors('', ''), $record);
                        }
                        $count++;
                    }
                }
                break;
            case 'estimates':
                $count = 0;
                $dupes = 0;
                foreach ($import['records'] as $record) {

                    unset($record['amount_paid_so_far']);
                    unset($record['is_new_client']);
                    unset($record['ask_for_currency']);

                    $invoice = $CI->invoice_m->find_invoice($record['invoice_number'], $record['amount'], $record['client_id']);

                    if ($invoice == 'EXISTS') {
                        $dupes++;
                        continue;
                    } elseif ($invoice == 'DUPLICATE_INVOICE_NUMBER') {
                        $record['invoice_number'] = $this->invoice_m->_generate_invoice_number(null, "ESTIMATE", null, $record['client_id']);
                    }

                    $unique_id = $this->invoice_m->insert($record);
                    if (!$unique_id) {
                        debug($record, isset($parts) ? $parts : '[NO PART INFO]', $this->form_validation->_error_array);
                    }

                    $count++;
                }
                break;
            case 'invoices':
                $count = 0;
                $dupes = 0;
                foreach ($import['records'] as $record) {
                    if (isset($record['original_from_pancake']) and $record['original_from_pancake']) {

                        $invoice = $CI->invoice_m->find_invoice($record['invoice_number'], $record['amount'], $record['client_id']);

                        if ($invoice == 'EXISTS') {
                            $dupes++;
                            continue;
                        }

                        foreach ($record['invoice_rows'] as $row) {
                            unset($row['id']);
                            $this->db->insert('invoice_rows', $row);
                        }

                        foreach ($record['partial_payments'] as $row) {
                            unset($row['id']);
                            $this->db->insert('partial_payments', $row);
                        }

                        unset($record['original_from_pancake']);
                        unset($record['id']);
                        unset($record['partial_payments']);
                        unset($record['invoice_rows']);

                        $this->db->insert('invoices', $record);
                        $count++;
                    } elseif (isset($record['format_v2'])) {
                        unset($record['format_v2']);
                        $invoice = $CI->invoice_m->find_invoice($record['invoice_number'], $record['amount'], $record['client_id']);

                        if ($invoice == 'EXISTS') {
                            $dupes++;
                            continue;
                        }

                        if (!$CI->invoice_m->insert($record)) {
                            debug(validation_errors(), $record);
                        }

                        $count++;
                    } else {

                        $amount_paid_so_far = @$record['amount_paid_so_far'];
                        $is_new_client = @$record['is_new_client'];
                        $ask_for_currency = @$record['ask_for_currency'];
                        $is_fully_paid = false;

                        unset($record['amount_paid_so_far']);
                        unset($record['is_new_client']);
                        unset($record['ask_for_currency']);

                        if ($amount_paid_so_far > 0) {

                            if ($amount_paid_so_far < $record['amount']) {
                                # Needs two partial payments.

                                $record['partial-amount'] = array(
                                    1 => $record['amount'] - $amount_paid_so_far,
                                    2 => $amount_paid_so_far
                                );

                                $record['partial-is_percentage'] = array(
                                    1 => 0,
                                    2 => 0,
                                );

                                $record['partial-notes'] = array(
                                    1 => '',
                                    2 => ''
                                );

                                $record['partial-due_date'] = array(
                                    1 => '',
                                    2 => ''
                                );
                            } else {
                                # Needs one fully paid partial payment.

                                $record['partial-amount'] = array(
                                    1 => $amount_paid_so_far
                                );

                                $record['partial-is_percentage'] = array(
                                    1 => 0,
                                );

                                $record['partial-notes'] = array(
                                    1 => '',
                                );

                                $record['partial-due_date'] = array(
                                    1 => '',
                                );

                                $is_fully_paid = true;
                            }
                        }

                        if (isset($record['parts'])) {
                            $parts = $record['parts'];

                            $record['partial-amount'] = array();
                            $record['partial-is_percentage'] = array();
                            $record['partial-notes'] = array();
                            $record['partial-due_date'] = array();

                            foreach ($parts as $key => $part) {
                                $record['partial-amount'][$key] = $part['amount'];
                                $record['partial-is_percentage'][$key] = 0;
                                $record['partial-notes'][$key] = $part['notes'];
                                $record['partial-due_date'][$key] = $record['due_date'];
                            }

                            unset($record['parts']);
                        }

                        if (!isset($record['invoice_number'])) {
                            debug($record);
                        }

                        $invoice = $CI->invoice_m->find_invoice($record['invoice_number'], $record['amount'], $record['client_id']);

                        if ($invoice == 'EXISTS') {
                            $dupes++;
                            continue;
                        } elseif ($invoice == 'DUPLICATE_INVOICE_NUMBER') {
                            $record['invoice_number'] = $this->invoice_m->_generate_invoice_number(null, 'DETAILED', null, $record['client_id']);
                        }

                        $unique_id = $this->invoice_m->insert($record);
                        if (!$unique_id) {
                            echo "<pre>";
                            var_dump($record, isset($parts) ? $parts : null);
                            var_dump($this->form_validation->_error_array);
                            die;
                        }
                        if ($is_fully_paid) {
                            $CI->ppm->setPartialPaymentDetails($unique_id, 1, $record['payment_date'], 'cash_m', 'Completed', '');
                        } elseif ($amount_paid_so_far > 0) {
                            $CI->ppm->setPartialPaymentDetails($unique_id, 2, $record['payment_date'], 'cash_m', 'Completed', '');
                        }

                        if (isset($parts)) {
                            foreach ($parts as $key => $part) {
                                if ($part['is_paid']) {
                                    $CI->ppm->setPartialPaymentDetails($unique_id, $key, $part['payment_date'], 'cash_m', 'Completed', '');
                                }
                            }
                        }

                        $count++;
                    }
                }
                break;
            default:
                throw new Exception("Unsupported type for importing: $type");
                break;
        }

        $return[$type] = array(
            'count' => $count,
            'duplicates' => $dupes,
        );

        return $return;
    }

    function store_export($type, $ext, $contents) {
        $filename = 'exports/' . $type . "-" . date('Ymd') . '-' . date('His') . '-' . substr(sha1(uniqid()), 0, 6) . '.' . $ext;

        if (!\Pancake\Filesystem\Filesystem::has("exports/index.html")) {
            \Pancake\Filesystem\Filesystem::write("exports/index.html", "This is the Pancake exports folder. It stores all exports ever made with Pancake.");
        }

        \Pancake\Filesystem\Filesystem::write($filename, $contents);

        return $filename;
    }

    function get_export_csv(&$fields, $records, $type) {
        $filename = tempnam(PANCAKE_TEMP_DIR, "pancake-temp-export-");
        fopen($filename, 'w+');
        $file = fopen($filename, 'w+');
        fputcsv($file, $fields);
        foreach ($records as $record) {
            fputcsv($file, $record);
        }
        fclose($file);
        $contents = file_get_contents($filename);
        unlink($filename);
        $new_filename = $this->store_export(str_ireplace("_csv", "", $type), 'csv', $contents);
        return array(
            'filename' => $new_filename,
            'contents' => $contents,
        );
    }

    function get_export_json($records, $type) {
        $contents = json_encode($records);
        $new_filename = $this->store_export($type, 'json', $contents);
        return array(
            'filename' => $new_filename,
            'contents' => $contents,
        );
    }

    function export($type) {

        $CI = &get_instance();

        switch ($type) {
            case 'invoices_csv':
                $CI->load->model('invoices/invoice_m');
                $data = $CI->invoice_m->get_invoices_csv();
                return $this->get_export_csv($data["fields"], $data["records"], $type);
            case 'clients_csv':
                $CI->load->model('clients/clients_m');
                $data = $CI->clients_m->get_clients_csv();
                return $this->get_export_csv($data["fields"], $data["records"], $type);
            case 'expenses_csv':
                $CI->load->model('projects/project_expense_m');
                $data = $CI->project_expense_m->get_expenses_csv();
                return $this->get_export_csv($data["fields"], $data["records"], $type);



            /*
              case 'proposals':
              $CI->load->model('proposals/proposals_m');
              $data = $CI->proposals_m->get_export();
              return $this->get_export_json($data, $type);
              case 'estimates':
              $CI->load->model('invoices/invoice_m');
              $data = $CI->invoice_m->get_estimates_export();
              return $this->get_export_json($data, $type);
              case 'clients':
              $CI->load->model('clients/clients_m');
              $data = $CI->clients_m->get_export();
              return $this->get_export_json($data, $type);
              case 'projects':
              $CI->load->model('projects/project_m');
              $data = $CI->project_m->get_export();
              return $this->get_export_json($data, $type);
              case 'time_entries':
              $CI->load->model('projects/project_time_m');
              $data = $CI->project_time_m->get_export();
              return $this->get_export_csv(array_keys($data[0]), $data, $type);
              case 'users':
              $CI->load->model('users/users_m');
              $users = $CI->user_m->get_export();
              return $this->get_export_csv(array_keys($users[0]), $users, $type);
             */
        }
    }

}
