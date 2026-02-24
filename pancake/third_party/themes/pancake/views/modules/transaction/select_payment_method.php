<div id="content">
    <h1 class="transaction-total text-center">
        <?php echo client_name($invoice["client_id"]); ?>
        <br />
        <?php echo Currency::format($part['billableAmount'], $invoice['currency_code']); ?>
        <small><?php echo __("invoices:invoicenumber", [$invoice['invoice_number']]) ?></small>
    </h1>
    <h2 class="text-center"><?php echo __('gateways:selectpaymentmethod'); ?></h2>
    <div class="text-center">
        <?php foreach ($gateways as $gateway) : ?>
            <?php echo anchor($payment_url . '/' . $gateway['gateway'], $gateway['frontend_title'], 'class="simple-button"'); ?>
        <?php endforeach; ?>
    </div>
</div>