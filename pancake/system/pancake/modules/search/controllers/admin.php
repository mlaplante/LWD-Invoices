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
 * The admin controller for search
 *
 * @subpackage	Controllers
 * @category	Search
 */
class Admin extends Admin_Controller {

    public function __construct() {
        parent::__construct();

        $this->load->model('invoices/invoice_m');
        $this->load->model('proposals/proposals_m');
        $this->load->model('clients/clients_m');
        $this->load->model('projects/project_m');
        $this->load->model('projects/project_expense_m');
    }

    public function index() {

        $term = '';

        if (isset($_REQUEST['q'])) {
            $term = $_REQUEST['q'];
        } elseif ($this->uri->segment(4)) {
            $term = $this->uri->segment(4);
        }

        $totalResults = 0;

        $results = array(
            'clients' => array(),
            'invoices' => array(),
            'estimates' => array(),
            'projects' => array(),
            'proposals' => array(),
        );

        // Only search if the query string isn't empty.
        if (!empty($term)) {
            // Clients

            $allowed_read_client_ids = get_assigned_ids('clients', 'read');

            $engine = new Search();
            $engine->set_table($this->db->dbprefix('clients'));
            $engine->set_columns(array('first_name', 'last_name', 'company', 'unique_id', 'email', 'profile', 'address'));

            $client_ids = array();
            
            foreach ($engine->execute($term, PHP_INT_MAX, 0) as $row) {
                if (in_array($row->id, $allowed_read_client_ids)) {
                    $results['clients'][] = $row;
                    $client_ids[] = $row->id;
                    $totalResults++;
                }
            }

            $this->clients_m->process_clients($results['clients']);
            
            // Invoices & Estimates
            $engine = new Search();
            $engine->set_table($this->db->dbprefix('invoices'));
            $engine->set_columns(array('notes', 'invoice_number', 'description', 'unique_id'));

            foreach ($engine->execute($term, PHP_INT_MAX, 0) as $row) {
                $invoice = $this->invoice_m->flexible_get_all(array('type' => 'all', 'unique_id' => $row->unique_id, 'get_single' => true, 'return_object' => true, 'include_totals' => true, 'include_partials' => true));
                if ($invoice) {
                    if (!isset($results[$row->type === 'ESTIMATE' ? 'estimates' : 'invoices'][$row->unique_id])) {
                        $results[$row->type === 'ESTIMATE' ? 'estimates' : 'invoices'][$row->unique_id] = $invoice;
                        $totalResults++;
                    }
                }
            }
            
            if (count($client_ids) > 0) {
                $invoices = $this->invoice_m->flexible_get_all(array('type' => 'all', 'client_id' => $client_ids, 'return_object' => true, 'include_totals' => true, 'include_partials' => true));
                foreach ($invoices as $invoice) {
                    if (!isset($results[$invoice->type === 'ESTIMATE' ? 'estimates' : 'invoices'][$invoice->unique_id])) {
                        $results[$invoice->type === 'ESTIMATE' ? 'estimates' : 'invoices'][$invoice->unique_id] = $invoice;
                        $totalResults++;
                    }
                }
            }

            $engine = new Search();
            $engine->set_table($this->db->dbprefix('invoice_rows'));
            $engine->set_columns(array('name', 'description'));

            foreach ($engine->execute($term, PHP_INT_MAX, 0) as $row) {
                $invoice = $this->invoice_m->flexible_get_all(array('type' => 'all', 'unique_id' => $row->unique_id, 'get_single' => true, 'return_object' => true, 'include_totals' => true, 'include_partials' => true));
                if ($invoice) {
                    if (!isset($results[$row->type === 'ESTIMATE' ? 'estimates' : 'invoices'][$row->unique_id])) {
                        $results[$invoice->type === 'ESTIMATE' ? 'estimates' : 'invoices'][$row->unique_id] = $invoice;
                        $totalResults++;
                    }
                }
            }

            // Projects

            $allowed_read_project_ids = get_assigned_ids('projects', 'read');

            $engine = new Search();
            $engine->set_table($this->db->dbprefix('projects'));
            $engine->set_columns(array('name', 'description', 'unique_id'));

            foreach ($engine->execute($term, PHP_INT_MAX, 0) as $project) {
                if (in_array($project->id, $allowed_read_project_ids)) {
                    $buffer = $this->project_m->get_projects_for_search('', '', '', $project->id);
                    $buffer = reset($buffer);
                    if ($buffer) {
                        $results['projects'][$project->id] = $buffer;
                    }
                    $totalResults++;
                }
            }
            
            if (count($client_ids) > 0) {
                $allowed_read_project_ids = get_assigned_ids('projects', 'read');
                $projects = $this->db->where_in("client_id", $client_ids)->get("projects")->result();
                foreach ($projects as $project) {
                    if (in_array($project->id, $allowed_read_project_ids)) {
                        $buffer = $this->project_m->get_projects_for_search('', '', '', $project->id);
                        $buffer = reset($buffer);
                        if ($buffer) {
                            $results['projects'][$project->id] = $buffer;
                        }
                        $totalResults++;
                    }
                }
            }

            // Proposals

            $allowed_read_proposals_ids = get_assigned_ids('proposals', 'read');

            $engine = new Search();
            $engine->set_table($this->db->dbprefix('proposals'));
            $engine->set_columns(array('proposal_number', 'unique_id', 'title', 'client_company', 'client_name'));

            foreach ($engine->execute($term, PHP_INT_MAX, 0) as $proposal) {
                if (in_array($proposal->id, $allowed_read_proposals_ids)) {
                    $results['proposals'][$proposal->id] = $proposal->id;
                    $totalResults++;
                }
            }
            
            if (count($client_ids) > 0) {
                $allowed_read_proposals_ids = get_assigned_ids('proposals', 'read');
                $proposals = $this->db->select("id")->where_in("client_id", $client_ids)->get("proposals")->result();
                foreach ($proposals as $proposal) {
                    if (in_array($proposal->id, $allowed_read_proposals_ids)) {
                        $results['proposals'][$proposal->id] = $proposal->id;
                        $totalResults++;
                    }
                }
            }

            $engine = new Search();
            $engine->set_table($this->db->dbprefix('proposal_sections'));
            $engine->set_columns(array('title', 'subtitle', 'contents'));

            foreach ($engine->execute($term, PHP_INT_MAX, 0) as $proposal_section) {
                if (in_array($proposal_section->proposal_id, $allowed_read_proposals_ids)) {
                    $results['proposals'][$proposal_section->proposal_id] = $proposal_section->proposal_id;
                    $totalResults++;
                }
            }

            if (count($results['proposals'])) {
                $results['proposals'] = $this->proposals_m->getAll(null, null, array(), $results['proposals']);
            }

        }
        
        $data = $this->dispatch_return('process_search_results', array(
            'term' => $term,
            'results' => $results,
            'total_results' => $totalResults,
        ), 'array');
        
        # Altered by a plugin.
        if (!isset($data['term'])) {
            $data = reset($data);
        }

        $this->template->query = $data['term'];
        $this->template->results = $data['results'];
        $this->template->totalResults = $data['total_results'];
        $this->template->build('index');
    }

}