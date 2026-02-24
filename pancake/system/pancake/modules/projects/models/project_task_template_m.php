<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package     Pancake
 * @author      Pancake Dev Team
 * @copyright   Copyright (c) 2010, Pancake Payments
 * @license     http://pancakeapp.com/license
 * @link        http://pancakeapp.com
 * @since       Version 1.0
 */

// ------------------------------------------------------------------------

/**
 * The Item Model
 *
 * @subpackage  Models
 * @category    Project
 */
class Project_task_template_m extends Pancake_Model {

    public function __construct()
    {
        parent::__construct();
        $this->load->model('projects/project_task_m');
        $this->load->model('projects/project_expense_m');
    }
}

/* End of file: project_expense_m.php */