<?php defined('BASEPATH') OR exit('No direct script access allowed');
/*
|--------------------------------------------------------------------------
| Enable/Disable Migrations
|--------------------------------------------------------------------------
|
| Migrations are disabled by default for security reasons.
| You should enable migrations whenever you intend to do a schema migration
| and disable it back when you're done.
|
*/
$config['migration_enabled'] = TRUE;

if (!file_exists(APPPATH.'migrations')) {
    $path = APPPATH . '../system/pancake/migrations';
} else {
    $path = APPPATH . 'migrations';
}

/*
|--------------------------------------------------------------------------
| Migrations version
|--------------------------------------------------------------------------
|
| This is used to set migration version that the file system should be on.
| If you run $this->migration->latest() this is the version that schema will
| be upgraded / downgraded to.
|
*/

$iterator = new DirectoryIterator($path);
$config['migration_version'] = 0;
foreach ($iterator as $file) {
    /** @var SplFileInfo $file */
    if ($file->isFile() && $file->getExtension() == "php" && preg_match("/^[0-9]{3}_/", $file->getFilename())) {
        $buffer = explode("_", $file->getFilename());
        $config['migration_version'] = max($buffer[0], $config['migration_version']);
    }
}

if ($config['migration_version'] < 100) {
    throw new Exception("Did not detect a valid number of migrations.");
}

/*
|--------------------------------------------------------------------------
| Migrations Path
|--------------------------------------------------------------------------
|
| Path to your migrations folder.
| Typically, it will be within your application path.
| Also, writing permission is required within the migrations path.
|
*/
$config['migration_path'] = $path;


/* End of file migration.php */
/* Location: ./application/config/migration.php */
