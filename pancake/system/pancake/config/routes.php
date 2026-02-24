<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');
/*
| -------------------------------------------------------------------------
| URI ROUTING
| -------------------------------------------------------------------------
| This file lets you re-map URI requests to specific controller functions.
|
| Typically there is a one-to-one relationship between a URL string
| and its corresponding controller class/method. The segments in a
| URL normally follow this pattern:
|
| 	example.com/class/method/id/
|
| In some instances, however, you may want to remap this relationship
| so that a different class/function is called than the one
| corresponding to the URL.
|
| Please see the user guide for complete details:
|
|	http://codeigniter.com/user_guide/general/routing.html
|
| -------------------------------------------------------------------------
| RESERVED ROUTES
| -------------------------------------------------------------------------
|
| There is one reserved routes:
|
|	$route['default_controller'] = 'welcome';
|
| This route indicates which controller class should be loaded if the
| URI contains no data. In the above example, the "welcome" class
| would be loaded.
*/

/**
 * @var    array    All the routable controller and module names
 */
$routable_controllers = array('ajax', 'users', 'files', 'transaction', 'feeds', 'javascript', 'cron', 'api');

$route['default_controller'] = "frontend";

foreach (scandir(FCPATH . "third_party/modules") as $plugin) {
    if ($plugin !== "." and $plugin !== ".." and is_dir(FCPATH . "third_party/modules/$plugin")) {
        $route["$plugin/(:any)"] = $plugin . '/frontend/$1';
        $route["admin/$plugin/(:any)"] = $plugin . '/admin/$1';
    }
}

$route['integrity.json'] = "frontend/integrity";

$route['paypal/process/(:any)'] = 'transaction/process/$1';
$route['admin/estimates/(:any)'] = "invoices/admin/$1";
$route['admin/estimates'] = "invoices/admin/index";
$route['admin/credit_notes/(:any)'] = "invoices/admin/$1";
$route['admin/credit_notes'] = "invoices/admin/index";
$route['no_internet_access'] = "upgrade/admin/no_internet_access";
$route['no_internet_access/(:any)'] = "upgrade/admin/no_internet_access/$1";

$route['admin'] = "dashboard/admin";
$route['admin/([a-zA-Z_-]+)/(:any)'] = "$1/admin/$2";
$route['admin/([a-zA-Z_-]+)'] = "$1/admin/index";

$route['api/1/projects/tasks'] = 'api_1/project_tasks';
$route['api/1/projects/tasks/(:any)'] = 'api_1/project_tasks/$1';

$route['api/1/settings'] = 'api_1/settings_controller';
$route['api/1/settings/(:any)'] = 'api_1/settings_controller/$1';

$route['api/1/(:any)'] = 'api_1/$1';

foreach ($routable_controllers as $controller) {
    $route[$controller . '(:any)'] = $controller . '$1';
}

if (file_exists(FCPATH . 'uploads/kitchen_route.txt')) {
    $kitchen_route = file_get_contents(FCPATH . 'uploads/kitchen_route.txt');
    $kitchen_route = empty($kitchen_route) ? 'client_area' : $kitchen_route;
} else {
    $kitchen_route = 'client_area';
}

$route[$kitchen_route . '/(:any)'] = 'kitchen/$1';

$route['(:any)'] = 'frontend/$1';

/* End of file routes.php */
/* Location: ./application/config/routes.php */