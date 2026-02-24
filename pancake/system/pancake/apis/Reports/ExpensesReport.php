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
 * Expenses Report
 *
 * @category Reports
 */
class ExpensesReport extends Report {

    protected $title = "expenses:expenses";
    protected $category_title = "reports:perclient";
    protected $action_verb = "reports:verb_created";
    protected $models_to_observe = ["Expenses_m"];

    function fields() {
        return [
            "id" => [__("global:name"), Report::TYPE_EXPENSE],
            "category_id" => [__("expenses:category"), Report::TYPE_EXPENSE_CATEGORY],
            "supplier_id" => [__("expenses:supplier"), Report::TYPE_EXPENSE_SUPPLIER],
            "client_id" => [__("global:client"), Report::TYPE_CLIENT],
            "project_id" => [__('global:project'), Report::TYPE_PROJECT],
            "due_date" => [__("projects:expense_date"), Report::TYPE_DATE],
            "is_billed" => [__("global:is_billed"), Report::TYPE_INVOICED],
            "unbilled_amount" => [__("global:unbilled_amount"), Report::TYPE_MONEY],
            "billed_amount" => [__("global:billed_amount"), Report::TYPE_MONEY],
            "amount" => [__("expenses:amount"), Report::TYPE_MONEY],
        ];
    }

    function filter($filters) {
        $db = get_instance()->db;

        if (isset($filters['client_id'])) {
            $db->join("projects", "projects.id = project_id");
            $db->where("client_id =", $filters['client_id']);
        }

        $expenses_table = $db->dbprefix("project_expenses");

        if (isset($filters['date(date) >='])) {
            $db->where("date($expenses_table.due_date) >=", $filters['date(date) >=']);
        }

        if (isset($filters['date(date) <='])) {
            $db->where("date($expenses_table.due_date) <=", $filters['date(date) <=']);
        }
    }

    function totals() {
        return ["amount", "billed_amount", "unbilled_amount"];
    }

    function created($model, $data, $primary_key) {
        $total = $data["qty"] * $data["rate"];
        $client_id = get_client("projects", $data["project_id"]);
        $is_billed = ($data["invoice_item_id"] > 0);

        return [
            "category" => $client_id,
            "id" => $data["id"],
            "row" => [
                "id" => $data["id"],
                "category_id" => $data["category_id"],
                "supplier_id" => $data["supplier_id"],
                "client_id" => $client_id,
                "project_id" => $data["project_id"],
                "due_date" => $data["due_date"],
                "is_billed" => $is_billed,
                "unbilled_amount" => $is_billed ? 0 : $total,
                "billed_amount" => $is_billed ? $total : 0,
                "amount" => $total,
            ],
        ];
    }

    function edited($model, $data, $previous, $primary_key) {
        $total = $data["qty"] * $data["rate"];
        $client_id = get_client("projects", $data["project_id"]);
        $is_billed = ($data["invoice_item_id"] > 0);

        return [
            "category" => $client_id,
            "id" => $data["id"],
            "row" => [
                "id" => $data["id"],
                "category_id" => $data["category_id"],
                "supplier_id" => $data["supplier_id"],
                "client_id" => $client_id,
                "project_id" => $data["project_id"],
                "due_date" => $data["due_date"],
                "is_billed" => $is_billed,
                "unbilled_amount" => $is_billed ? 0 : $total,
                "billed_amount" => $is_billed ? $total : 0,
                "amount" => $total,
            ],
        ];
    }

    function deleted($model, $data, $primary_key) {
        return [
            "id" => $primary_key,
        ];
    }

    function format($field, $value) {
        if ($field == "project_id" && $value == 0) {
            return __('expenses:no_project_business_expense');
        } else {
            return parent::format($field, $value);
        }
    }

}