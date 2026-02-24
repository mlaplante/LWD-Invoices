<?php

defined('BASEPATH') or exit('No direct script access allowed');

class Module_Proposals extends Module {

    public $version = '1.0';

    public function info() {

        $shortcuts = array();


        $shortcuts[] = array(
            'name' => 'proposals:newproposal',
            'uri' => 'admin/proposals/create',
            'class' => 'add blue-btn',
        );

        return array(
            'name' => array(
                'english' => 'Proposals',
            ),
            'description' => array(
                'english' => 'Create and share proposals containing estimates and cover letters.',
            ),
            'frontend' => TRUE,
            'backend' => TRUE,
            'menu' => 'proposals',
            'roles' => array(
                'create', 'view', 'edit', 'delete', 'send',
            ),
            'shortcuts' => $shortcuts,
        );
    }

}

/* End of file details.php */
