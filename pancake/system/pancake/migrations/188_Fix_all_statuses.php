<?php

defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Fix_all_statuses extends CI_Migration {

    function up() {
        $default_statuses = array(
            array(
                'id' => 1,
                'title' => 'Pending',
                'background_color' => '#41b8e3',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #1e83a8',
                'box_shadow' => '0px 1px 1px 0px #1e83a8',
            ),
            array(
                'id' => 2,
                'title' => 'Open',
                'background_color' => '#88ce5c',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #5ca534',
                'box_shadow' => '0px 1px 1px 0px #62a33d',
            ),
            array(
                'id' => 3,
                'title' => 'Closed',
                'background_color' => '#9a9a9a',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #787878',
                'box_shadow' => '0px 1px 1px 0px #787878',
            ),
        );

        foreach ($default_statuses as $status) {
            $this->db->where('id', $status['id'])->where('title', 'Array')->update('ticket_statuses', $status);
        }

        $default_priorities = array(
            array(
                'id' => 1,
                'title' => 'Normal',
                'background_color' => '#41b8e3',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #1e83a8',
                'box_shadow' => '0px 1px 1px 0px #1e83a8',
            ),
            array(
                'id' => 2,
                'title' => 'Elevated',
                'background_color' => '#88ce5c',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #5ca534',
                'box_shadow' => '0px 1px 1px 0px #62a33d',
            ),
            array(
                'id' => 3,
                'title' => 'Urgent',
                'background_color' => '#eb4141',
                'font_color' => '#ffffff',
                'text_shadow' => '1px 1px #b32222',
                'box_shadow' => '0px 1px 1px 0px #b32222',
            ),
        );

        foreach ($default_priorities as $status) {
            $this->db->where('id', $status['id'])->where('title', 'Array')->update('ticket_priorities', $status);
        }
    }

    function down() {
        
    }

}