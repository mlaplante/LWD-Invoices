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
 * @since		Version 3.2
 */
// ------------------------------------------------------------------------

/**
 * The Files Model
 *
 * @subpackage	Models
 * @category	Files
 */
class Kitchen_files_m extends Pancake_Model {

    /**
     * @var	string	The name of the files table
     */
    protected $table = 'project_files';

    public function get_by_unique_id($unique_id) {
	return $this->db->where('invoice_unique_id', $unique_id)->get($this->table)->result_array();
    }

    /**
     * Uploads the files.
     *
     * @access	public
     * @param	array	The $_FILES['input_name']
     * @param	string	The unique id
     * @return	void
     */
    public function upload($input, $comment_id, $client_id) {
	
	$return = pancake_upload($input, $comment_id, 'client', $client_id);
	
	if ($return === NOT_ALLOWED) {
	    return NOT_ALLOWED;
	} elseif ($return) {
	    foreach ($return as $real_name => $file) {
		$result = parent::insert(array(
			'comment_id' => $comment_id,
			'created' => time(),
			'orig_filename' => $real_name,
			'real_filename' => $file['folder_name'] . $real_name
		    ));
	    }
	    return true;
	} else {
	    return false;
	}
    }
    
    public function verify_uploads($input) {
	return pancake_upload($input, 'test', 'client', 0, true);
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