<?php defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * The base model class.
 *
 * @subpackage Models
 *
 * @property \CI_Router $router
 * @property \CI_URI $uri
 * @property \CI_Session $session
 * @property \Template $template
 * @property \CI_Form_validation $form_validation
 * @property \CI_Input $input
 *
 * @property Clients_m                    $clients_m
 * @property Invoice_m                    $invoice_m
 * @property Partial_payments_m           $ppm
 * @property Partial_payments_m           $partial_payments_m
 * @property Project_m                    $project_m
 * @property Project_task_m               $project_task_m
 * @property CI_DB_query_builder          $db
 * @property CI_Loader                    $load
 * @property Paypal_lib                   $paypal_lib
 * @property Project_expense_m            $project_expense_m
 * @property Expenses_m                   $expenses_m
 * @property Clients_credit_alterations_m $clients_credit_alterations_m
 * @property Project_milestone_m          $project_milestone_m
 * @property Project_time_m               $project_time_m
 * @property CI_Config                    $config
 * @property Files_m                      $files_m
 * @property Assignments                  $assignments
 * @property Kitchen_comment_m            $kitchen_comment_m
 * @property User_m                       $user_m
 * @property Proposals_m                  $proposals_m
 * @property Clients_meta_m               $clients_meta_m
 * @property Ticket_m                     $ticket_m
 * @property Ticket_statuses_m            $ticket_statuses_m
 * @property Business_identities_m        $business_identities_m
 * @property Project_timers_m             $project_timers_m
 * @property Ion_auth_model $ion_auth_model
 * @property Ion_auth $ion_auth
 */
class Pancake_Model extends CI_Model {
    /**
	 * @var    string    The name of the table
	 */
	protected $table = FALSE;

    /**
     * @var    string    The primary ID of the table
     */
    public $primary_key = 'id';

    /**
     * @var    string    The name of the field for the human value of each table's record.
     */
    public $human_value = 'name';

	/**
	 *
	 *
	 * @var array	An array of validation rules
	 */
	protected $validate = array();

	/**
	 * @var bool	Whether to skip the auto validation
	 */
	protected $skip_validation = FALSE;

    /**
     * The cache of ID => Human Value for each record in this model's table.
     *
     * @var array
     */
    protected $human_value_cache = [];

	public function __construct()
	{
		parent::__construct();
		if ( ! $this->table)
		{
			$this->_guess_table();
		}
	}

	public function __call($name, $params)
	{
		$valid_calls = array(
			'get_by'			=> 'get_by_',
			'get_many_by'		=> 'get_many_by_',
			'update_by'			=> 'update_by_',
			'update_many_by'	=> 'update_many_by_',
			'delete_by'			=> 'delete_by_',
			'delete_many_by'	=> 'delete_many_by_',
			'count_by'			=> 'count_by_',
		);

		foreach ($valid_calls as $real_call => $alias_call)
		{
			if (preg_match('/^'.$alias_call.'(.*?)$/i', $name, $matches))
			{
				return call_user_func(array($this, $real_call), $matches[1], $params[0]);
			}
		}

        trigger_error('Call to undefined method ' . get_class($this) . '::' . $name . '()', E_USER_ERROR);
    }


	/**
	 * Get a single record by primary key
	 *
	 * @param	string	The primary key value
	 * @return	object
	 */
	public function get($primary_value)
	{
		return $this->db->where($this->primary_key, $primary_value)
						->get($this->table)
						->row();
	}

	/**
	 * Get a single record by creating a WHERE clause with
	 * the key of $key and the value of $val.
	 *
	 * @param string $key The key to search by
	 * @param string $val The value of that key
	 * @return object
	 * @author Phil Sturgeon
	 */
	public function get_by()
	{
		$where = func_get_args();
		$this->_set_where($where);

		return $this->db->get($this->table)
			->row();
	}

	/**
	 * Similar to get_by(), but returns a result array of
	 * many result objects.
	 *
	 * @param string $key The key to search by
	 * @param string $val The value of that key
	 * @return array
	 * @author Phil Sturgeon
	 */
	public function get_many($primary_value)
	{
		$this->db->where($this->primary_key, $primary_value);
		return $this->get_all();
	}

	/**
	 * Similar to get_by(), but returns a result array of
	 * many result objects.
	 *
	 * @param string $key The key to search by
	 * @param string $val The value of that key
	 * @return array
	 * @author Phil Sturgeon
	 */
	public function get_many_by()
	{
		$where = func_get_args();
		$this->_set_where($where);

		return $this->get_all();
	}

	/**
	 * Get all records in the database
	 *
	 * @return array
	 * @author Jamie Rumbelow
	 */
	public function get_all()
	{
		return $this->db->get($this->table)
			->result();
	}

	/**
	 * Similar to get_by(), but returns a result array of
	 * many result objects.
	 *
	 * @param string $key The key to search by
	 * @param string $val The value of that key
	 * @return array
	 * @author Phil Sturgeon
	 */
	public function count_by()
	{
		$where = func_get_args();
		$this->_set_where($where);

		return $this->db->count_all_results($this->table);
	}

	/**
	 * Get all records in the database
	 *
	 * @return array
	 * @author Phil Sturgeon
	 */
	public function count_all()
	{
		return $this->db->count_all($this->table);
	}

	/**
	 * Insert a new record into the database,
	 * calling the before and after create callbacks.
	 * Returns the insert ID.
	 *
	 * @param array $data Information
	 * @return integer
	 * @author Jamie Rumbelow
	 * @modified Dan Horrigan
	 */
	public function insert($data, $skip_validation = FALSE)
	{
		if ($skip_validation or $this->validate($data))
		{
			$this->db->insert($this->table, $data);
			$primary_key = $this->db->insert_id();
			$this->dispatch_return('model_insert', [
				'model' => $this,
				'data' => $data,
				'primary_key' => $primary_key,
			], 'array');

			return $primary_key;
		}
		else
		{
			return FALSE;
		}
	}

	/**
	 * Similar to insert(), just passing an array to insert
	 * multiple rows at once. Returns an array of insert IDs.
	 *
	 * @param array $data Array of arrays to insert
	 * @return array
	 * @author Jamie Rumbelow
	 */
	public function insert_many($data, $skip_validation = FALSE)
	{
		$ids = array();

		foreach ($data as $row)
		{
			if ($skip_validation or $this->validate($data))
			{
				$data = $this->_run_before_create($row);
				$this->db->insert($this->table, $row);
				$this->_run_after_create($row, $this->db->insert_id());

				$ids[] = $this->db->insert_id();
			}
			else
			{
				$ids[] = FALSE;
			}
		}

		$this->skip_validation = FALSE;
		return $ids;
	}

	/**
	 * Update a record, specified by an ID.
	 *
	 * @param integer $id The row's ID
	 * @param array $array The data to update
	 * @return bool
	 * @author Jamie Rumbelow
	 */
	public function update($primary_value, $data, $skip_validation = FALSE)
	{

		if($skip_validation or $this->validate($data))
		{
			$previous = $this->db->where($this->primary_key, $primary_value)->get($this->table)->row_array();
			$result = $this->db->where($this->primary_key, $primary_value)->set($data)->update($this->table);

			$this->dispatch_return('model_update', [
				'model' => $this,
				'data' => $data,
				'previous' => $previous,
				'primary_key' => $primary_value,
			], 'array');

			return $result;
		}
		else
		{
			return FALSE;
		}
	}

	/**
	 * Update a record, specified by $key and $val.
	 *
	 * @param string $key The key to update with
	 * @param string $val The value
	 * @param array $array The data to update
	 * @return bool
	 * @author Jamie Rumbelow
	 */
	public function update_by()
	{
		$args = func_get_args();
		$data = array_pop($args);
		$this->_set_where($args);

		if($this->validate($data))
		{
			$this->skip_validation = FALSE;
			return $this->db->set($data)
				->update($this->table);
		}
		else
		{
			return FALSE;
		}
	}

	/**
	 * Updates many records, specified by an array
	 * of IDs.
	 *
	 * @param array $primary_values The array of IDs
	 * @param array $data The data to update
	 * @return bool
	 * @author Phil Sturgeon
	 */
	public function update_many($primary_values, $data, $skip_validation)
	{
		$valid = TRUE;
		if($skip_validation === FALSE)
		{
			$valid = $this->validate($data);
		}

		if($valid)
		{
			$this->skip_validation = FALSE;
			return $this->db->where_in($this->primary_key, $primary_values)
				->set($data)
				->update($this->table);

		}
		else
		{
			return FALSE;
		}
	}

	/**
	 * Updates all records
	 *
	 * @param array $data The data to update
	 * @return bool
	 * @since 1.1.3
	 * @author Phil Sturgeon
	 */
	public function update_all($data)
	{
		return $this->db->set($data)
			->update($this->table);
	}

	/**
	 * Delete a row from the database table by the
	 * ID.
	 *
	 * @param integer $id
	 * @return bool
	 * @author Jamie Rumbelow
	 */
	public function delete($id)
	{
        $this->dispatch_return('model_before_delete', [
            'model' => $this,
            'data' => $this->db->where($this->primary_key, $id)->get($this->table)->row_array(),
            'primary_key' => $id,
        ], 'array');

	    $result = $this->db->where($this->primary_key, $id)->delete($this->table);

		$this->dispatch_return('model_delete', [
			'model' => $this,
			'primary_key' => $id,
		], 'array');

		return $result;

	}

	/**
	 * Delete a row from the database table by the
	 * key and value.
	 *
	 * @param	string	The 'WHERE' column
	 * @param	string	The 'WHERE' value
	 * @return	bool
	 */
	public function delete_by()
	{
		$where = func_get_args();
		$this->_set_where($where);

		return $this->db->delete($this->table);
	}

	/**
	 * Delete many rows from the table where the primary
	 * key is in the array of values
	 *
	 * @access	public
	 * @param	array	The array of primary key values
	 * @return	bool
	 */
	public function delete_many($values)
	{
		return $this->db->where_in($this->primary_key, $values)->delete($this->table);
	}

	/**
	* Orders the the results by some criteria
	*
	* @param	string	The order by criteria
	* @param	string	The order to return them in
	* @return	object	$this
	*/
	public function order_by($criteria, $order = 'ASC')
	{
		$this->db->order_by($criteria, $order);
		return $this;
	}

	/**
	* Limits and offsets the results
	*
	* @access	public
	* @param	int		The number of rows
	* @param	int		The offset
	* @return	object	$this
	*/
	public function limit($limit, $offset = 0)
	{
		$this->db->limit($limit, $offset);
		return $this;
	}


	/**
	* Limits and offsets the results
	*
	* @access	public
	* @param	int		The number of rows
	* @param	int		The offset
	* @return	object	$this
	*/
	public function select($fields, $escape = false)
	{
		$this->db->select($fields, $escape);
		return $this;
	}


	/**
	* Limits and offsets the results
	*
	* @access	public
	* @param	int		The number of rows
	* @param	int		The offset
	* @return	object	$this
	*/
	public function where()
	{
		$args = func_get_args();
		call_user_func_array(array($this->db, 'where'), $args);

		return $this;
	}

	/**
	 * Runs validation on the passed data.  Also used to turn off
	 * validation like this:
	 *
	 * $this->validate(FALSE);
	 *
	 * @access	protected
	 * @param	array	The data to validate
	 * @return	bool
	 */
	public function validate($data)
	{
		if ($this->skip_validation or empty($this->validate))
		{
			return TRUE;
		}

		if (empty($data))
		{
			return FALSE;
		}

		foreach($data as $key => $val)
		{
			$_POST[$key] = $val;
		}

		$this->load->library('form_validation');
		if (is_array($this->validate))
		{
			$this->form_validation->set_rules($this->validate);
			return $this->form_validation->run();
		}
		else
		{
			return $this->form_validation->run($this->validate);
		}
	}

	public function skip($skip=TRUE)
	{
		$this->skip_validation = ($skip === TRUE);
		return $this;
	}

	/**
	 * Dispatch any possible events and return the value.
	 */
	public function dispatch_return($event, $value, $return_type = 'string') {
		return Events::has_listeners($event) ? Events::trigger($event, $value, $return_type) : $value;
	}

	/**
	 * Guesses the table name
	 *
	 * @access	public
	 * @return	void
	 */
	private function _guess_table()
	{
		$this->load->helper('inflector');
		$class = preg_replace('/(_m|_model)?$/', '', get_class($this));

		$this->table = plural(strtolower($class));
	}


    /**
     * Sets the where from given paramters
     *
     * @access	private
     * @param	array	An array of parameters
     * @return	void
     */
    private function _set_where($params) {
        if (is_array($params[0])) {
            foreach ($params[0] as $key => $value) {
                if (is_array($value)) {
                    $this->db->where_in($key, $value);
                } else {
                    $this->db->where($key, $value);
                }
            }
        } else {
            $this->db->where($params[0], $params[1]);
        }
    }

    /**
     * Get the human value of a record for a model.
     *
     * @param integer $record_id
     *
     * @return string
     */
    public function get_human_value($record_id) {
        if (empty($this->human_value_cache)) {
            $results = $this->db->select("{$this->primary_key} as primary_key, {$this->human_value} as human_value", false)->get($this->table)->result_array();
            foreach ($results as $result) {
                $this->human_value_cache[$result["primary_key"]] = $result["human_value"];
            }
        }

        if (isset($this->human_value_cache[$record_id])) {
            return $this->human_value_cache[$record_id];
        } else {
            return __("global:na");
        }
    }

}