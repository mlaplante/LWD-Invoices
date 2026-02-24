<?php

defined('BASEPATH') OR exit('No direct script access allowed');
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
 * The javascript controller
 *
 * @subpackage	Controllers
 * @category	Javascript
 */
class Cron extends Pancake_Controller {

    public function invoices() {
        $this->load->model('invoices/invoice_m');
        $this->load->model('projects/project_m');

        echo "Current Time: ". date("r") . (IS_CLI ? PHP_EOL : '<br/>');
        echo "-- Running Invoice Cron --" . (IS_CLI ? PHP_EOL : '<br/>');
        $var = $this->invoice_m->refresh_reoccurring_invoices();
        if (empty($var)) {
            echo "Did not have anything to do." . (IS_CLI ? PHP_EOL : '<br/>');
        } else {
            echo $var;
        }
        echo '-- Finished Invoice Cron --' . (IS_CLI ? PHP_EOL : '<br/>') . (IS_CLI ? PHP_EOL : '<br/>') . (IS_CLI ? PHP_EOL : '<br/>');

        echo "-- Running Plugin Crons (if any) --" . (IS_CLI ? PHP_EOL : '<br/>');
        $this->dispatch_return('cron', array(), 'boolean');
        echo (IS_CLI ? PHP_EOL : '<br/>') . '-- Finished Plugin Crons --' . (IS_CLI ? PHP_EOL : '<br/>');

        Settings::set("last_cron_run_datetime", now()->timestamp);
    }

}

/* End of file cron.php */