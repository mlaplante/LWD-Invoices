<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package        Pancake
 * @author         Pancake Dev Team
 * @copyright      Copyright (c) 2015, Pancake Payments
 * @license        http://pancakeapp.com/license
 * @link           http://pancakeapp.com
 * @since          Version 4.8.8
 */

// ------------------------------------------------------------------------

/**
 * The Reusable Invoice Items API controller
 *
 * @subpackage    Controllers
 * @category      API
 */
class Reusable_invoice_items extends REST_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->model('items/item_m');
    }

    /**
     * Get All Reusable Invoice Items
     *
     * Parameters:
     *  + limit = 5
     *  + start = 0
     *  + sort_by = email (default: id)
     *  + sort_dir = asc (default: asc)
     *
     * @link   /api/1/reusable_invoice_items   GET Request
     */
    public function index_get() {
        $sort_by  = $this->get('sort_by') !== false ? $this->get('sort_by') : 'id';
        $sort_dir = $this->get('sort_dir') !== false ? $this->get('sort_dir') : 'asc';
        $limit    = $this->get('limit') === false ? PHP_INT_MAX : $this->get('limit');
        $offset   = $this->get('start') === false ? 0 : $this->get('start');

        $items = $this->item_m->flexible_get_all(array(
            "per_page" => $limit,
            "offset" => $offset,
            "order" => array($sort_by => $sort_dir),
            "return_object" => false,
        ));

        $count = count($items);
        $this->response(array(
            'status' => true,
            'message' => "Found $count reusable invoice items.",
            'records' => $items,
            'count' => $count
        ), 200);
    }

    /**
     * Get Reusable Invoice Item by ID
     *
     * @link   /api/1/reusable_invoice_items/show    GET Request
     */
    public function show_get() {
        if (!$this->get('id')) {
            $err_msg = 'No "id" was provided.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 400);
        }

        $id = $this->get('id');

        $item = $this->item_m->flexible_get_all(array(
            "id" => $id,
            "get_single" => true,
            "return_object" => false,
        ));

        if (empty($item)) {
            $err_msg = 'Could not find a reusable invoice item with ID = ' . $id . '.';
            $this->response(array('status' => false, 'message' => $err_msg, 'error_message' => $err_msg), 404);
        } else {
            $this->response(array('status' => true, 'message' => "Found a reusable invoice item with ID = $id.", 'record' => $item), 200);
        }
    }

}