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
 * The Files Model
 *
 * @subpackage	Models
 * @category	Files
 */
class Files_m extends Pancake_Model {

    /**
     * @var	string	The name of the files table
     */
    protected $table = 'files';

    public function get_by_unique_id($unique_id) {
		return $this->db->where('invoice_unique_id', $unique_id)->get($this->table)->result_array();
    }

    /**
     * Stores files using the enabled filesystem adapters and returns their new, randomised names that can be used to retrieve the files.
     *
     * @param array          $input   The $_FILES[field_name] array. Accepts single-file or multi-file uploads.
     * @param string         $type    The type of upload (e.g. invoices). Will determine the folder in which the file is stored.
     * @param string|integer $item_id An identifier which, combined with the type, ties this file to a record in the database.
     *
     * @return array|string An array of uploaded filenames on success or NOT_ALLOWED if the file extension is not in the list of allowed extensions.
     * @throws \Pancake\Filesystem\WriteException If the file can't be written to all enabled storage adapters.
     */
    public function store($input, $type, $item_id = null) {
        $result = pancake_upload($input, $item_id, $type);

        if (!$result) {
            return false;
        }

        if ($result === NOT_ALLOWED) {
            return NOT_ALLOWED;
        }

        $files = [];
        foreach ($result as $uploaded_file) {
            parent::insert(array(
                'invoice_unique_id' => (string) $item_id,
                'orig_filename' => $uploaded_file["original_name"],
                'real_filename' => $uploaded_file["folder_name"] . $uploaded_file["real_name"],
            ));

            $files[] = $uploaded_file["folder_name"] . $uploaded_file["real_name"];
        }

        return $files;
    }

    /**
     * Uploads the files.
     *
     * @access	public
     * @param	array	The $_FILES['input_name']
     * @param	string	The unique id
     * @return	void
     */
    public function upload($input, $unique_id) {

    	$type="invoice";

    	switch($unique_id){
    		case 'settings':
    			$type="settings";
    		break;
    		case 'tickets':
    			$type="tickets";
    		break;
    	}

		$return = pancake_upload($input, $unique_id, $type);

		if (!$return) {
		    return FALSE;
		}

		if ($return === NOT_ALLOWED) {
		    return NOT_ALLOWED;
		}

		switch($unique_id){
			case 'settings':
				return $return;
			break;
			case 'tickets':
				return $return;
			break;
			default:
				foreach ($return as $real_name => $file) {
					//hmm...
					$result = parent::insert(array(
						'invoice_unique_id' => $unique_id,
						'orig_filename' => $real_name,
						'real_filename' => $file['folder_name'] . $real_name
					));
				}
			return true;
			break;
		}
	}

    public function is_filename_allowed($filename) {
        $allowed = explode(',', Settings::get('allowed_extensions'));
        $is_allowed = false;
        foreach ($allowed as $one_allowed_extension) {
            $one_allowed_extension = trim($one_allowed_extension);

            if (strtolower(pathinfo($filename, PATHINFO_EXTENSION)) == strtolower($one_allowed_extension)) {
                $is_allowed = true;
            }
        }

        return $is_allowed;
    }

    public function verify_uploads($input) {
		return pancake_upload($input, 'test', 'invoice', 0, true);
    }

    public function delete($file_id) {
		$file = parent::get($file_id);
		if (!empty($file)) {
		    parent::delete($file_id);
            \Pancake\Filesystem\Filesystem::delete($file->real_filename);
        }
    }

}

/* End of file: settings_m.php */