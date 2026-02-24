<?php

defined('BASEPATH') OR exit('No direct script access allowed');
/**
 * Pancake
 *
 * A simple, fast, self-hosted invoicing application
 *
 * @package		Pancake
 * @author		Pancake Dev Team
 * @copyright	Copyright (c) 2011, Pancake Payments
 * @license		http://pancakeapp.com/license
 * @link		http://pancakeapp.com
 * @since		Version 2.2
 */
// ------------------------------------------------------------------------

/**
 * The Proposals Model
 *
 * @subpackage	Models
 * @category	Proposals
 */
class Proposals_m extends Pancake_Model {

    public $table = 'proposals';
    public $sections_table = 'proposal_sections';
    public $invoices_table = 'invoices';
    public $primary_key = 'unique_id';
    public $get_estimates = true; # Overriden when sending proposal emails to avoid template problems. Trust me, it's easier this way. - Bruno.

    function create($data) {
        $unique_id = $this->_generate_unique_id();
        $CI = &get_instance();
        $CI->load->model('clients/clients_m');
        $client = $CI->clients_m->get($data['client_id']);

		if($client->first_name !=''){
			$data['client_name'] = $client->first_name . ' ' . $client->last_name;
		} else {
			$data['client_name'] = '';
		}

        $data['client_address'] = $client->address;
        $data['client_company'] = $client->company;
        $data['proposal_number'] = $this->_generate_proposal_number($data['proposal_number']);
        $this->db->insert($this->table, array(
            'owner_id' => current_user(),
            'unique_id' => $unique_id,
            'created' => time(),
            'last_sent' => 0,
            'invoice_id' => 0,
            'project_id' => 0,
            'client_id' => 0,
            'title' => '',
            'status' => '',
            'client_company' => '',
            'client_address' => '',
            'client_name' => '',
            'last_status_change' => 0,
            'last_viewed' => 0,
            'proposal_number' => 0,
            'is_viewable' => 0,
        ));
        $id = $this->db->insert_id();
        if ($this->edit($id, $data)) {
            return $unique_id;
        } else {
            return false;
        }
    }

    function accept($unique_id) {
	$CI = &get_instance();
        $CI->load->model('invoices/invoice_m');

        if (!logged_in()) {
            $proposal = $this->db->select('id, client_id')->where('unique_id', $unique_id)->get('proposals')->row_array();
            get_instance()->load->model('notifications/notification_m');
            Notify::client_accepted_proposal($proposal['id'], $proposal['client_id']);
        }

        $CI->invoice_m->acceptProposalEstimates($this->getIdByUniqueId($unique_id));
        return $this->db->where('unique_id', $unique_id)->update($this->table, array('status' => 'ACCEPTED', 'last_status_change' => time()));
    }

    function setViewable($unique_id, $is_viewable = false) {
        return $this->db->where('unique_id', $unique_id)->update($this->table, array('is_viewable' => (int) $is_viewable));
    }

    function reject($unique_id) {
	$CI = &get_instance();
        $CI->load->model('invoices/invoice_m');

        if (!logged_in()) {
            $proposal = $this->db->select('id, client_id')->where('unique_id', $unique_id)->get('proposals')->row_array();
            get_instance()->load->model('notifications/notification_m');
            Notify::client_rejected_proposal($proposal['id'], $proposal['client_id']);
        }

	$CI->invoice_m->rejectProposalEstimates($this->getIdByUniqueId($unique_id));
        return $this->db->where('unique_id', $unique_id)->update($this->table, array('status' => 'REJECTED', 'last_status_change' => time()));
    }

    function unanswer($unique_id) {
	$CI = &get_instance();
        $CI->load->model('invoices/invoice_m');
	$CI->invoice_m->unanswerProposalEstimates($this->getIdByUniqueId($unique_id));
        return $this->db->where('unique_id', $unique_id)->update($this->table, array('status' => '', 'last_status_change' => time()));
    }

    function duplicate($unique_id) {

	$proposal = $this->db->get_where('proposals', array('unique_id' => $unique_id))->row_array();
	$sections = $this->db->get_where('proposal_sections', array('proposal_id' => $proposal['id']))->result_array();

	$newUniqueId = $this->_generate_unique_id();
	$newNumber   = $this->_generate_proposal_number();

	unset($proposal['id']);
	$proposal['unique_id']          = $newUniqueId;
	$proposal['created']            = time();
	$proposal['status']             = '';
	$proposal['last_viewed']        = 0;
	$proposal['last_status_change'] = 0;
	$proposal['proposal_number']    = $newNumber;

	$this->db->insert('proposals', $proposal);
	$id = $this->db->insert_id();

	$CI = &get_instance();
	$CI->load->model('invoices/invoice_m');

	foreach ($sections as $section) {
	    unset($section['id']);
	    $section['proposal_id'] = $id;

	    if ($section['section_type'] == 'estimate') {
		# Duplicate the estimate too.
		$details = $CI->invoice_m->duplicate($CI->invoice_m->getUniqueIdById($section['contents']));
                $section['contents'] = $details['id'];
		$CI->invoice_m->setProposalIdById($section['contents'], $id);
	    }

	    $this->db->insert('proposal_sections', $section);
	}

	return $newNumber;

    }

    function archive($unique_id) {
        $this->db->where("unique_id", $unique_id)->update($this->table, array("is_archived" => 1));
    }

    function restore($unique_id) {
        $this->db->where("unique_id", $unique_id)->update($this->table, array("is_archived" => 0));
    }

    function edit($id, $data) {

        if ($id == 0) {
            // Should not allow this to work.
            return false;
        }

        if (!isset($data['sections']) or (isset($data['sections']) and !is_array($data['sections'])) or (isset($data['sections']) and empty($data['sections']))) {
            $data['sections'][1] = array(
                'page_key' => 1
            );
        }

        $sections = $data['sections'];
        unset($data['sections']);

        if ($this->db->where('id', $id)->update($this->table, $data)) {

            $this->deleteSections($id);
            $this->db->where('proposal_id', $id)->update($this->invoices_table, array('proposal_id' => 0));

            foreach ($sections as $key => $section) {
                $this->setSection($id, (!empty($section['page_key']) ? $section['page_key'] : $page_key), (!empty($section['key']) ? $section['key'] : $key), $section);
            }

            return true;
        } else {
            return false;
        }
    }

    function sendNotificationEmail($unique_id, $message = NULL, $subject = null, $emails = null) {
        $proposal = $this->get_by('unique_id', $unique_id);
        $proposal->url = site_url('proposal/' . $unique_id);

        $this->load->model('clients/clients_m');
        $client = $this->clients_m->get($proposal->client_id);

        $proposal->number = $proposal->proposal_number;
        $parser_array = array(
            'proposal' => $proposal,
            'number' => $proposal->proposal_number,
            'title' => $proposal->title
        );

        if (Settings::get('enable_pdf_attachments') == 0) {
            $pdf = array();
        } else {
            $pdf = get_pdf('proposal', $unique_id);

            $pdf = array(
                $pdf['filename'] => $pdf['contents']
            );
        }

        $result = Pancake\Email\Email::send(array(
            'to' => $emails ? $emails : $client->email,
            'template' => 'new_proposal',
            'client_id' => $proposal->client_id,
            'data' => $parser_array,
            'attachments' => $pdf,
            'subject' => $subject,
            'message' => $message,
            'unique_id' => $proposal->unique_id,
            'item_type' => 'proposal'
        ));

        if ($result) {
            $this->db->where('id', $proposal->id);
            $this->db->update('proposals', array('last_sent' => time(), 'is_viewable' => 1));
            return true;
        } else {
            return false;
        }
    }

    function count($where = array()) {
        where_assigned('proposals', 'read');
        $this->db->where($where);
        return $this->db->count_all_results($this->table);
    }

    function getProposalNumberByUniqueId($unique_id) {
	$buffer = $this->db->select('proposal_number')->where('unique_id', $unique_id)->get($this->table)->row_array();
        return $buffer['proposal_number'];
    }

    function getProposalNumberById($id) {
	$buffer = $this->db->select('proposal_number')->where('id', $id)->get($this->table)->row_array();
        return isset($buffer['proposal_number']) ? $buffer['proposal_number'] : '';
    }

    function getByUniqueId($unique_id, $pdf = false) {
        $result = $this->getAll(null, null, array('unique_id' => $unique_id));
        foreach ($result as $row) {
            $row = (array) $row;
            if (!$row['client']) {
                throw new \Pancake\PancakeException("The client for the proposal $unique_id no longer exists.");
            }

            $row['client']->company = $row['client_company'];
            $row['client']->address = $row['client_address'];
            $row['client']->name = $row['client_name'];

            $row['pages'] = $this->getProposalPages($row['id'], $pdf);
            return $row;
        }
    }

    function getById($id, $pdf = false) {
        $result = $this->getAll(null, null, array('id' => $id));
        foreach ($result as $row) {
            $row = (array) $row;
            if (!$row['client']) {
                throw new \Pancake\PancakeException("The client for the proposal $id no longer exists.");
            }

            $row['client']->company = $row['client_company'];
            $row['client']->address = $row['client_address'];
            $row['client']->name = $row['client_name'];
            return $row;
        }
    }

    function getProposalPages($proposal_id, $pdf = false) {
        $sections = $this->db->where('proposal_id', $proposal_id)->order_by('page_key', 'asc')->order_by('key', 'asc')->get($this->sections_table)->result_array();
        $pages = array();

        $CI = &get_instance();
        $CI->load->model('files/files_m');

        foreach ($sections as $section) {

            $section['estimate_id'] = ($section['section_type'] == 'estimate') ? $section['contents'] : '';
            if ($section['section_type'] == 'estimate' and $this->get_estimates) {
                $invoice = $this->invoice_m->get($section['contents'], 'id');
                $this->template->is_paid = $this->invoice_m->is_paid($invoice['unique_id']);
                $this->template->files = (array) $CI->files_m->get_by_unique_id($invoice['unique_id']);
                $this->template->invoice = (array) $invoice;
                $this->template->pdf_mode = $pdf;
                $this->template->is_overdue = (bool) ($invoice > 0 AND $invoice['due_date'] < time());
                $this->template->is_estimate = true;
                $this->template->set_layout(false);
                $section['contents'] = $this->template->build('detailed', array(), true);
                $this->template->set_layout(true);
            }

            if ($section['parent_id'] == 0) {
                $pages[$section['page_key']]['sections'][$section['key']] = $section;
            } else {
                $pages[$section['page_key']]['sections'][$section['parent_id']]['sections'] = $section;
            }
        }
        return $pages;
    }

    function get_export() {
        $proposals = $this->db->get('proposals')->result_array();
        $buffer_proposal_sections = $this->db->get('proposal_sections')->result_array();
        $proposal_sections = array();

        foreach ($buffer_proposal_sections as $row) {
            if (!isset($proposal_sections[$row['proposal_id']])) {
                $proposal_sections[$row['proposal_id']] = array();
            }

            $proposal_sections[$row['proposal_id']][] = $row;
        }

        $return = array();
        foreach ($proposals as $key => $proposal) {
            $proposal['proposal_sections'] = $proposal_sections[$proposal['id']];
            $return[] = $proposal;
        }
        return $return;
    }

    function getAll($per_page = null, $offset = null, $where = array(), $ids = array()) {
        $CI = &get_instance();
        $CI->load->model('clients/clients_m');
        $CI->load->model('invoices/invoice_m');

        where_assigned('proposals', 'read');

        if ($per_page !== null) {
            $this->db->limit($per_page, $offset);
        }

        if (count($ids) > 0) {
            $this->db->where_in('id', $ids);
        }

        $result = $this->db->select('proposals.*')->order_by('proposals.created', 'desc')->where($where)->get($this->table)->result();

        $return = array();
        foreach ($result as $key => $row) {
            $row->amount = $CI->invoice_m->getProposalAmount($row->id);
            $row->url = site_url('proposal/' . $row->unique_id);
            $row->client = $CI->clients_m->get($row->client_id);
            $return[$key] = $row;
        }
        return $return;
    }

    // --------------------------------------------------------------------

    /**
     * Retrieves all viewable proposals
     *
     * @access  public
     * @param   int     Optional project id
     * @param   bool    The offset to start from
     * @return  object  The result object
     */
    public function get_all_viewable($client_id = null, $is_viewable = TRUE)
    {
        if($client_id !== NULL)
        {
            $this->db->where('proposals.client_id', $client_id);
        }

        if($is_viewable !== FALSE)
        {
            $this->db->where('proposals.is_viewable', 1);
            $this->db->where('proposals.is_archived', 0);
        }

        $this->db->select('COUNT('.$this->db->dbprefix('comments').'.id) total_comments')
                 ->join('comments', $this->db->dbprefix('comments').'.item_id = proposals.id and '.$this->db->dbprefix('comments').'.is_private = 0 AND '.$this->db->dbprefix('comments').'.item_type = "proposal"', 'left')
                 ->group_by('proposals.id');

        return $this->getAll(null, null);
    }

    function delete_by_client($client_id) {
        $buffer = $this->db->select('unique_id')->where('client_id', $client_id)->get($this->table)->result_array();
        foreach ($buffer as $row) {
            $this->delete($row['unique_id']);
        }
        return true;
    }

    function delete($unique_id) {
	$CI = &get_instance();
	$CI->load->model('invoices/invoice_m');
        $id = $this->getIdByUniqueId($unique_id);
        if ($id) {
            if ($this->db->where('id', $id)->delete($this->table)) {
		if ($CI->invoice_m->resetProposalEstimates($id)) {
		    if ($this->deleteSections($id)) {
			return true;
		    }
		}
            }
            return false;
        }
        return true;
    }

    function recordView($unique_id) {
        get_instance()->load->model('notifications/notification_m');

        $proposal = $this->getByUniqueId($unique_id);

        # Only record views for proposals that exist.
        if (isset($proposal['id'])) {
            $event = 'decide_should_record_view';
            if (Events::has_listeners($event)) {
                $results = Events::trigger($event, [
                    "record" => $proposal,
                    "type" => "proposal",
                ], null);
                $should_record_view = array_end($results);

                if (!is_bool($should_record_view)) {
                    $should_record_view = true;
                    log_without_error("A plugin did not return a valid 'should_record_view'.", $results);
                }
            } else {
                $should_record_view = true;
            }

            if (!$should_record_view) {
                return false;
            }

            Notify::client_viewed_proposal($proposal['id'], $proposal['client_id']);

            return $this->db->where('unique_id', $unique_id)->update($this->table, array('last_viewed' => time(), 'is_viewable' => 1));
        }
    }

    function deleteEstimateSections($estimate_id) {
        return $this->db->where('section_type', 'estimate')->where('contents', $estimate_id)->delete($this->sections_table);
    }

    function deleteSections($proposal_id) {
        return $this->db->where('proposal_id', $proposal_id)->delete($this->sections_table);
    }

    function createPremadeSection($title, $subtitle, $contents) {
        return $this->db->insert($this->sections_table, array(
            'title' => $title,
            'proposal_id' => 0,
            'key' => 0,
            'page_key' => 0,
            'parent_id' => 0,
            'section_type' => '',
            'subtitle' => $subtitle,
            'contents' => $contents
        ));
    }

    function getPremadeSections() {
	return $this->db->get_where($this->sections_table, array(
	    'proposal_id' => 0
	))->result_array();
    }

    function getIdByUniqueId($unique_id) {
        $buffer = $this->db->select('id')->where('unique_id', $unique_id)->get($this->table)->row_array();
        return (int) (isset($buffer['id']) ? $buffer['id'] : 0);
    }

    function getClientIdByUniqueId($unique_id) {
        $buffer = $this->db->select('client_id')->where('unique_id', $unique_id)->get($this->table)->row_array();
        return (int) (isset($buffer['client_id']) ? $buffer['client_id'] : 0);
    }

    function deleteSection($id) {
	return $this->db->where('id', $id)->delete($this->sections_table);
    }

    public function mark_as_sent($unique_id) {
        return $this->db->where('unique_id', $unique_id)->update($this->table, [
            'last_sent' => time(),
            'is_viewable' => 1,
        ]);
    }

    public function set_viewable($id, $is_viewable) {
        $this->db->where("id", $id);
        $this->db->update($this->table, [
            "is_viewable" => $is_viewable,
        ]);
    }

    function setSection($proposal_id, $page_key, $key, $data) {
        $id = $this->db->select('id')->where('proposal_id', $proposal_id)->where('page_key', $page_key)->where('key', $key)->get($this->sections_table)->row_array();
        $id = isset($id['id']) ? $id['id'] : false;
        $data['key'] = $key;
        $data['page_key'] = $page_key;
        $data['proposal_id'] = $proposal_id;
        $data['section_type'] = !empty($data['section_type']) ? $data['section_type'] : 'section';

        if ($data['section_type'] == 'estimate') {
            $this->db->where('id', $data['contents'])->update($this->invoices_table, array('proposal_id' => $proposal_id));
        }

        if ($id) {
            return $this->db->where('id', $id)->update($this->sections_table, $data);
        } else {

            if (!isset($data['title'])) {
                $data['title'] = '';
            }

            if (!isset($data['subtitle'])) {
                $data['subtitle'] = '';
            }

            if (!isset($data['contents'])) {
                $data['contents'] = '';
            }

            if (!isset($data['parent_id'])) {
                $data['parent_id'] = 0;
            }

            return $this->db->insert($this->sections_table, $data);
        }
    }

    /**
     * Generates the unique id for a partial payment
     *
     * @access	public
     * @return	string
     */
    public function _generate_unique_id() {
        $this->load->helper('string');

        $valid = FALSE;
        while ($valid === FALSE) {
            $unique_id = random_string('alnum', 8);
            $results = $this->db->where('unique_id', $unique_id)->get($this->table)->result();
            if (empty($results)) {
                $valid = TRUE;
            }
        }

        return $unique_id;
    }

    /**
     * Generates a proposal number
     *
     * @access	private
     * @return	string
     */
    public function _generate_proposal_number($number = null) {
        $this->load->helper('string');

        if (!empty($number)) {
            if ($this->db->where('proposal_number', $number)->count_all_results($this->table) == 0) {
               return $number;
            }
        }

        $valid = FALSE;
        $result = $this->db->limit(1)->select('proposal_number')->order_by('proposal_number', 'desc')->get($this->table)->row_array();
        $invoice_number = isset($result['proposal_number']) ? $result['proposal_number'] : 0;
        $invoice_number++;
        while ($valid === FALSE) {
            if ($this->db->where('proposal_number', $invoice_number)->count_all_results($this->table) == 0) {
                $valid = TRUE;
            } else {
                $invoice_number++;
            }
        }

        return $invoice_number;
    }

    function past_30_days() {
        return $this->getAll(null, null, array('created >' => strtotime('-30 days')));
    }

}