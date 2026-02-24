<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo $list_title; ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>

<?php
switch ($type) {
    case 'ESTIMATE':
        $no_filtered = 'estimates:noestimatesforthefilteredclient';
        $no_all = 'estimates:noestimatetitle';
        $no_body = 'estimates:noestimatebody';
        $new = 'estimates:createnew';
        break;
    case "CREDIT_NOTE":
        $no_filtered = 'credit_notes:nocredit_notesforthefilteredclient';
        $no_all = 'credit_notes:no_credit_notes';
        $no_body = 'credit_notes:no_credit_notes_body';
        $new = 'credit_notes:create';
        break;
    default:
        $no_filtered = 'invoices:noinvoicesforthefilteredclient';
        $no_all = 'invoices:noinvoicetitle';
        $no_body = 'invoices:noinvoicebody';
        $new = 'invoices:newinvoice';
        break;
}

$no_filtered = __($no_filtered);
$no_all = __($no_all);
$no_body = __($no_body);
$new = __($new);

?>

<div class="row">
    <div class="three columns push-nine side-bar-wrapper" style="margin-top: 0px;">
        <?php $this->load->view("partials/quick_links", array("quick_links_owner" => "admin/invoices")); ?>
        <div class="form-holder panel">
            <div class="filters">
                <form method="get" action="<?php echo site_url(uri_string()); ?>">
                <h4 class="sidebar-title"><?php echo lang('clients:filter') ?></h4>
                <p><span class="dropdown-arrow"><?php echo form_dropdown('client_id', $clients_dropdown, $client_id, 'class="js-submit-on-change"'); ?></span></p>
                </form>
            </div><!-- /filters -->
        </div><!-- /panel -->
    </div><!-- /three columns side-bar-wrapper -->

    <div class="nine columns pull-three content-wrapper">
        <?php if (empty($invoices)): // If there aren't invoices  ?>

            <div class="no_object_notification">
                <h4><?php echo $client_id ? __($no_filtered, array(trim(str_ireplace('(0)', '', $clients_dropdown[$client_id])))) : $no_all ?></h4>
                <p><?php echo $no_body ?></p>
                <p class="call_to_action"><a class="blue-btn" href="<?php echo site_url('admin/' . human_invoice_type($type) . '/create'); ?>" title="<?php echo $new ?>"><span><?php echo $new ?></span></a></p>
            </div><!-- /no_object_notification -->

        <?php else: // else we do the following  ?>

            <div class="table-area thirty-days invoice-group">
                <?php $this->load->view('reports/table', array('rows' => $invoices)); ?>
            </div>

            <div class="pagination">
                <?php echo $this->pagination->create_links(); ?>
            </div>

        <?php endif; ?>
    </div><!-- /nine columns content-wrapper -->

</div><!-- /row -->





