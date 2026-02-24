<?php

/**
 * Pancake
 * A simple, fast, self-hosted invoicing application.
 *
 * @category  APIs
 * @package   Pancake
 * @author    Pancake Dev Team <support@pancakeapp.com>
 * @copyright 2016 Pancake Payments
 * @license   https://www.pancakeapp.com/license Pancake End User License Agreement
 * @link      https://www.pancakeapp.com
 * @since     4.13.0
 */

namespace Pancake\Reports;

/**
 * The Reports Abstract Class<br />Specifies an interface and default methods for all Pancake reports.
 *
 * @category Reports
 */
abstract class Report implements \ArrayAccess, \Countable, \JsonSerializable {

    const TYPE_TEXT = "text";
    const TYPE_BOOLEAN = "boolean";
    const TYPE_INVOICED = "invoiced";
    const TYPE_MONEY = "money";
    const TYPE_DATE = "date";
    const TYPE_CLIENT = "client";
    const TYPE_PROJECT = "project";
    const TYPE_INVOICE = "invoice";
    const TYPE_EXPENSE = "expense";
    const TYPE_EXPENSE_CATEGORY = "expense_category";
    const TYPE_EXPENSE_SUPPLIER = "expense_supplier";

    protected $title;
    protected $category_title;
    protected $action_verb;
    protected $category_breakdown;
    protected $totals = [];
    protected $rows;
    protected $models_to_observe = [];
    protected $position = 0;
    protected $fields = [];
    protected $is_hydrated = false;

    function __construct() {
        if (empty($this->models_to_observe)) {
            throw new ReportsException(static::class . " is not set to observe any models, which means it will never be fed any data!");
        }

        if (empty($this->title)) {
            throw new ReportsException(static::class . " does not have a title.");
        }

        if (empty($this->category_title)) {
            throw new ReportsException(static::class . " does not have a 'per' category title (e.g. Client, Payment Method) for the Reports page.");
        }

        if (empty($this->action_verb)) {
            throw new ReportsException(static::class . " does not have an action verb (e.g. Created, Paid) to display on the Reports page.");
        }

        foreach ($this->totals() as $total) {
            $this->totals[$total] = 0;
        }
    }

    function getTitle() {
        return __($this->title);
    }

    function getCategoryTitle() {
        return __($this->category_title);
    }

    function getModelsToObserve() {
        return $this->models_to_observe;
    }

    function getActionVerb() {
        return __($this->action_verb);
    }

    function getTotalFields() {
        return array_keys($this->totals);
    }

    function getRow($id) {
        if (isset($this->rows[$id])) {
            return $this->rows[$id];
        } else {
            throw new ReportsException("Cannot get Row $id; it does not exist.");
        }
    }

    function getRows() {
        return $this->rows;
    }

    function format($field, $value) {
        $format = $this->fields[$field][1];
        $formatted_value = null;
        $CI = get_instance();

        switch ($format) {
            case static::TYPE_MONEY:
                $formatted_value = \Currency::format($value);
                break;
            case static::TYPE_EXPENSE:
                $CI->load->model("expenses/expenses_m");
                $formatted_value = $CI->expenses_m->get_human_value($value);
                break;
            case static::TYPE_EXPENSE_CATEGORY:
                $CI->load->model("expenses/expenses_categories_m");
                $formatted_value = $CI->expenses_categories_m->get_human_value($value);
                break;
            case static::TYPE_EXPENSE_SUPPLIER:
                $CI->load->model("expenses/expenses_suppliers_m");
                $formatted_value = $CI->expenses_suppliers_m->get_human_value($value);
                break;
            case static::TYPE_CLIENT:
                $CI->load->model("clients/clients_m");
                $formatted_value = $CI->clients_m->get_human_value($value);
                break;
            case static::TYPE_PROJECT:
                $CI->load->model("projects/project_m");
                $formatted_value = $CI->project_m->get_human_value($value);
                break;
            case static::TYPE_INVOICED:
                $CI->load->model("invoices/invoice_m");
                $formatted_value = $value ? "Yes" : "No";
                break;
            case static::TYPE_DATE:
                $formatted_value = format_date(carbon($value));
                break;
            default:
                throw new ReportsException("The field '$field' is of type '$format'. This type is not valid.");
        }

        return $formatted_value;
    }

    function getTotal($field) {
        return $this->totals[$field];
    }

    function getCategoryBreakdown() {
        return $this->category_breakdown;
    }

    function getFields() {
        if (empty($this->fields)) {
            $this->fields = $this->fields();
        }

        return $this->fields;
    }

    abstract function fields();

    abstract function filter($filters);

    abstract function created($model, $data, $primary_key);

    abstract function edited($model, $data, $previous, $primary_key);

    abstract function deleted($model, $data, $primary_key);

    function handleInsert(\Pancake_Model $model, $data, $primary_key) {
        $result = $this->created($model, $data, $primary_key);
        $class = get_class($model);

        if (!isset($result['id'])) {
            throw new ReportsException("No Row ID was returned for a '$class' record that was inserted into the database.");
        }

        if (!isset($result['category'])) {
            throw new ReportsException("No Category was returned for a '$class' record that was inserted into the database.");
        }

        if (!isset($result['row'])) {
            throw new ReportsException("No Row details were returned for a '$class' record that was inserted into the database.");
        }

        $main_total_field = array_reset($this->getTotalFields());

        foreach ($this->getTotalFields() as $total_field) {
            $this->totals[$total_field] += $result['row'][$total_field];
        }

        $this->rows[$result['id']] = $result['row'];

        if (!isset($this->category_breakdown[$result['category']])) {
            $this->category_breakdown[$result['category']] = 0;
        }

        $this->category_breakdown[$result['category']] += $result['row'][$main_total_field];
    }

    function handleUpdate(\Pancake_Model $model, $data, $previous, $primary_key) {
        $result = $this->created($model, $data, $previous, $primary_key);
        $class = get_class($model);
        debug($result);
    }

    function handleBeforeDelete(\Pancake_Model $model, $data, $primary_key) {
        $result = $this->deleted($model, $data, $primary_key);
        $class = get_class($model);

        if (!isset($result['id'])) {
            throw new ReportsException("No Row ID was returned for a '$class' record that was inserted into the database.");
        }

        if (count($result) == 1) {
            # Only the ID was provided, so we're trying to remove the row.
            unset($this->rows[$result['id']]);
        } else {
            // @todo
            throw new ReportsException("Updating rows based on deleted records has not yet been implemented.");
        }
    }

    public function offsetSet($offset, $value): void {
        throw new ReportsException("It is not possible to set a row of a report manually.");
    }

    public function offsetExists($offset): bool
    {
        return isset($this->rows[$offset]);
    }

    public function offsetUnset($offset): void {
        $this->removeRow($offset);
    }

    #[\ReturnTypeWillChange]
    public function offsetGet($offset) {
        if (isset($this->rows[$offset])) {
            return $this->rows[$offset];
        } else {
            throw new ReportsException("Row $offset does not exist.");
        }
    }

    public function count(): int {
        return count($this->rows);
    }

    public function hydrate($rows, $totals, $category_breakdown) {
        if (!$this->is_hydrated) {
            $this->rows = $rows;
            $this->totals = $totals;
            $this->category_breakdown = $category_breakdown;
            $this->is_hydrated = true;
        } else {
            throw new ReportsException("You cannot re-hydrate a report.");
        }
    }

    public function getIsHydrated() {
        return $this->is_hydrated;
    }

    #[\ReturnTypeWillChange]
    public function jsonSerialize() {
        return [
            "rows" => $this->rows,
            "totals" => $this->totals,
            "category_breakdown" => $this->category_breakdown,
        ];
    }

}