<div id="modal-header">
    <div class="row">
        <h3 class="ttl ttl3"><?php echo __("invoices:auto_charge"); ?></h3>
    </div>
</div>

<form method="post" action="<?php echo site_url("admin/invoices/auto_charge/{$invoice['unique_id']}"); ?>" class="contents">
    <div class="row">
        <div class="twelve columns">
            <div style="margin: 20px 0;">
                <p>Are you sure you want to charge <?php echo client_name($invoice['client_id']); ?> for Invoice #<?php echo $invoice['invoice_number']; ?>?</p>
                <p>Pancake will automatically try to charge <?php echo Currency::format($invoice['unpaid_amount'], $invoice['currency_code']); ?> via <?php echo $gateways; ?>.</p>
            </div>
        </div>
    </div>
    <div class="row">
        <div class="twelve columns">
            <button type="submit" name="submit" class="blue-btn"><span>Proceed</span></button>
            <a href="#" class="blue-btn js-close-modal"><span>Cancel</span></a>
        </div>
    </div>
</form>
