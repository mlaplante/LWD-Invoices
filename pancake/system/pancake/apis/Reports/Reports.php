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
 * The Reports Class<br />Holds all registered records and handles all their data and caching.
 *
 * @category Reports
 */
class Reports {

    /**
     * An array containing an instance of each registered report.
     *
     * @var Report[]
     */
    protected static $reports = [];

    protected static $models_to_observe = [];

    public static function getRegisteredReports() {
        return array_keys(self::$reports);
    }

    public static function registerReport($class, $name = null) {
        if ($name === null) {
            $name = url_title(preg_replace("/Report$/ui", "", array_end(explode("\\", $class))), '-', true);
        }

        self::$reports[$name] = new $class();

        foreach (self::$reports[$name]->getModelsToObserve() as $model) {
            if (!isset(self::$models_to_observe[$model])) {
                self::$models_to_observe[$model] = [];
            }

            self::$models_to_observe[$model][] = $name;
        }
    }

    public static function registerEvents() {
        \Events::register("model_insert", [self::class, "handleInsert"]);
        \Events::register("model_update", [self::class, "handleUpdate"]);
        \Events::register("model_before_delete", [self::class, "handleBeforeDelete"]);
    }

    public static function handleInsert(\Pancake_Model $model, $data, $primary_key) {
        $class = get_class($model);

        if (isset(self::$models_to_observe[$class])) {
            foreach (self::$models_to_observe[$class] as $report) {
                self::$reports[$report]->handleInsert($model, $data, $primary_key);
            }
        }
    }

    public static function handleUpdate($model, $data, $previous, $primary_key) {
        $class = get_class($model);

        if (isset(self::$models_to_observe[$class])) {
            foreach (self::$models_to_observe[$class] as $report) {
                self::$reports[$report]->handleUpdate($model, $data, $previous, $primary_key);
            }
        }
    }

    public static function handleBeforeDelete($model, $data, $primary_key) {
        $class = get_class($model);

        if (isset(self::$models_to_observe[$class])) {
            foreach (self::$models_to_observe[$class] as $report) {
                self::$reports[$report]->handleBeforeDelete($model, $data, $primary_key);
            }
        }
    }

    public static function getOverviews() {

    }

    public static function getReport($name, $filters) {
        if (isset(self::$reports[$name])) {

            # Hydrate report before handing it over.
            # For now we're doing it without caching.
            foreach (self::$reports[$name]->getModelsToObserve() as $model) {
                /** @var \Pancake_Model $model_object */

                $model = strtolower($model);
                $CI = get_instance();
                $model_object = $CI->$model;
                self::$reports[$name]->filter($filters);
                $rows = $model_object->get_all();

                foreach ($rows as $row) {
                    $row = (array) $row;
                    self::$reports[$name]->handleInsert($model_object, $row, $row["id"]);
                }
            }

            return self::$reports[$name];
        } else {
            throw new ReportsException("The report $name does not exist. Registered reports: " . implode_to_human_csv(array_keys(self::$reports)));
        }
    }

}