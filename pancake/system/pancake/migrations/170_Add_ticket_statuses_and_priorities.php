<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Migration_Add_ticket_statuses_and_priorities extends CI_Migration {

    public function up() {
		$this->db->query('CREATE TABLE IF NOT EXISTS `'.$this->db->dbprefix('ticket_statuses').'` (
				  `id` int(11) NOT NULL AUTO_INCREMENT,
				  `title` varchar(255) NOT NULL,
                  `background_color` varchar(50) NOT NULL,
				  `font_color` varchar(50) NOT NULL,
				  `text_shadow` varchar(50) NOT NULL,
				  `box_shadow` varchar(50) NOT NULL,
				  PRIMARY KEY (`id`)
				) ENGINE=MYISAM DEFAULT CHARSET=utf8;');

		$this->db->query('CREATE TABLE IF NOT EXISTS `'.$this->db->dbprefix('ticket_priorities').'` (
				  `id` int(11) NOT NULL AUTO_INCREMENT,
				  `title` varchar(255) NOT NULL,
                  `background_color` varchar(50) NOT NULL,
				  `font_color` varchar(50) NOT NULL,
				  `text_shadow` varchar(50) NOT NULL,
				  `box_shadow` varchar(50) NOT NULL,
				  PRIMARY KEY (`id`)
				) ENGINE=MYISAM DEFAULT CHARSET=utf8;');

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
            if ($this->db->where('id', $status['id'])->count_all_results('ticket_statuses') == 0) {
                $this->db->insert('ticket_statuses', $status);
            }
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

		foreach ($default_priorities as $priority) {
            if ($this->db->where('id', $priority['id'])->count_all_results('ticket_priorities') == 0) {
                $this->db->insert('ticket_priorities', $priority);
            }
        }
    }

}
