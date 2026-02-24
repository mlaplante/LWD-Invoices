<?php defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Modules model
 *
 * @author 		PyroCMS Development Team
 * @package 	PyroCMS
 * @subpackage 	Modules
 * @category	Modules
 * @since 		v1.0
 */
class Module_m extends CI_Model
{
	private $spawned = array();
	
	/**
	 * Get
	 *
	 * Return an array containing module data
	 *
	 * @access	public
	 * @param	string	$module		The name of the module to load
	 * @return	array
	 */
	public function get($slug = '')
	{
		if ( ! ($module = $this->_spawn_class($slug)))
		{
			return FALSE;
		}
		
		list($class, $location) = $module;
		$info = $class->info();

		$lang = Settings::get('language');

		$name = ! isset($info['name'][$lang]) ? $info['name']['english'] : $info['name'][$lang];
		$description = ! isset($info['description'][$lang]) ? $info['description']['english'] : $info['description'][$lang];

		return array(
			'name' => $name,
			'slug' => $slug,
			'version' => $class->version,
			'description' => $description,
			'author' => $class->author,
			'author_url' => $class->author_url,
			// 'skip_xss' => $info->skip_xss,
			'is_frontend' => (bool) $info['frontend'],
			'is_backend' => (bool) $info['backend'],
			'menu' => $info['menu'],
			'sections' => ! empty($info['sections']) ? $info['sections'] : array(),
			'shortcuts' => ! empty($info['shortcuts']) ? $info['shortcuts'] : array(),
			'path' => $location,
		);
	}
	
	public function get_all()
	{
		$details_files = glob(APPPATH.'modules/*/details.php');
		
		$modules = array();
		foreach ($details_files as $file)
		{
			$slug = basename(dirname($file));
			$modules[] = $this->get($slug);
		}
		
		return $modules;
	}

	/**
	 * Spawn Class
	 *
	 * Checks to see if a details.php exists and returns a class
	 *
	 * @param	string	$slug	The folder name of the module
	 * @access	private
	 * @return	array
	 */
	private function _spawn_class($slug)
	{
		if (isset($this->spawned[$slug]))
		{
			return $this->spawned[$slug];
		}
		
		// Before we can install anything we need to know some details about the module
		$details_file = APPPATH . 'modules/' . $slug . '/details.php';

		if ( ! is_file($details_file))
		{
			return FALSE;
		}

		// Sweet, include the file
		include_once $details_file;

		// Now call the details class
		$class = 'Module_'.ucfirst(strtolower($slug));

		// Now we need to talk to it
		return class_exists($class) ? ($this->spawned[$slug] = array(new $class, dirname($details_file))) : FALSE;
	}


	/**
	 * Roles
	 *
	 * Retrieves roles for a specific module
	 *
	 * @param	string	$slug	The module slug
	 * @return	bool
	 */
	public function roles($slug)
	{
		//first try it as a core module
		if ($module = $this->_spawn_class($slug))
		{
			list($class) = $module;
			$info = $class->info();

			if ( ! empty($info['roles']))
			{
				$this->lang->load($slug.'/permission');
				return $info['roles'];
			}
		}

		return array();
	}

}