<?php

defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Pancake
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2016, Pancake Payments
 * @license        https://www.pancakeapp.com/license
 * @link           https://www.pancakeapp.com
 * @since          Version 4.12.9
 */

/**
 * Stops CI_Migration from being able to downgrade.
 *
 * @property Builder $builder
 * @property CI_DB_query_builder $db
 */
class Pancake_Migration extends CI_Migration {

    public function __construct($config = array()) {
        parent::__construct($config);
        $this->load->library("builder");
    }

    /**
     * Hijack latest to behave like current.
     *
     * @return mixed
     */
    public function latest() {
        return $this->current();
    }

    /**
     * @inheritdoc
     */
    public function version($target_version) {
        $current_version = $this->_get_version();

        if ($current_version < 100) {
            throw new \Pancake\PancakeException("Cannot detect the current migration version correctly.");
        }

        if ($target_version < $current_version) {
            throw new \Pancake\PancakeException("Downgrading Pancake's database is not permitted.");
        }

        return parent::version($target_version);
    }

}