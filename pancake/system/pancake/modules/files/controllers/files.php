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
 * The frontend controller
 *
 * @subpackage	Controllers
 * @category	Frontend
 */
class Files extends Public_Controller {

    // ------------------------------------------------------------------------

    public function download($unique_id, $file_id) {
        $this->load->model('files_m');
        $this->load->model('invoices/invoice_m');
        $this->load->helper('download');

        $file = $this->files_m->get_by(array('invoice_unique_id' => $unique_id, 'id' => $file_id));
        $invoice = $this->invoice_m->get($unique_id);

        $requires_payment = get_instance()->dispatch_return('decide_invoice_requires_payment_before_file_download', array('invoice' => &$invoice), 'boolean');
        $requires_payment = is_array($requires_payment) ? true : $requires_payment;
        $requires_payment = $requires_payment ? !$invoice['is_paid'] : false; # If requires payment and is paid, then no payment is required.

        if ($requires_payment) {
            show_error('Invoice has not yet been paid, so download is forbidden.');
        }

        if (empty($file)) {
            show_error('File not found.');
        }

        $original_filename = $file->orig_filename;
        $file = $file->real_filename;

        if (\Pancake\Filesystem\Filesystem::has($file)) {
            force_download($original_filename, \Pancake\Filesystem\Filesystem::read($file));
        } else {
            throw new \Pancake\Filesystem\FileNotFoundException("The file you were trying to access ($file) does not exist in " . implode(", ", \Pancake\Filesystem\Filesystem::getEnabledAdapters()) . ".");
        }
    }

    public function fetch()
    {
        $this->load->helper('download');

        $file = rtrim(urldecode(uri_string()), "/");
        $regex = "~((?:index\\.php/)?files/fetch/?)~uis";

        if (preg_match($regex, $file)) {
            $file = preg_replace($regex, "", $file);
        }

        $suffix = "/fetch";
        if (substr($file, -strlen($suffix)) == $suffix) {
            $file = substr($file, 0, -strlen($suffix));
        }

        # Decode a second time, just in case it was double-encoded (happens; see #29687). - Bruno
        $file = urldecode($file);
        $file = trim($file);

        if (empty($file)) {
            show_404();
        }

        if (\Pancake\Filesystem\Filesystem::has($file)) {
            $filename = array_end(explode("/", $file));
            $data = \Pancake\Filesystem\Filesystem::read($file);
            $mime = \GuzzleHttp\Psr7\MimeType::fromFilename($filename);
            header('Content-Type: ' . $mime);
            header('Content-Disposition: inline; filename="' . $filename . '"');
            # $one_day = now()->addDay()->setTimezone("GMT")->format("D, d M Y H:i:s e");
            # header('Expires: ' . $one_day);
            # We're not doing expires yet because if you add sleep(2) here browsers are still fetching it.
            # Probably because of Last-Modified header, we need to set it correctly.
            # This'll be added in a future update.
            header('Cache-Control: public');
            header("Content-Length: " . strlen($data));
            echo $data;
        } else {
            throw new \Pancake\Filesystem\FileNotFoundException("The file you were trying to access ($file) does not exist in " . implode(", ", \Pancake\Filesystem\Filesystem::getEnabledAdapters()) . ".");
        }
    }

}

/* End of file files.php */