<h1 class="transaction-total text-center">
    <?php echo client_name($invoice["client_id"]); ?>
    <br />
    <?php echo Currency::format($amount, $invoice['currency_code']); ?>
    <small><?php echo __("invoices:invoicenumber", [$invoice['invoice_number']]) ?></small>
</h1>
<div style="text-align: center;">
    <?php if (empty($fee)): ?>
        <?php if ($autosubmit): ?>
            <h2><?php echo __('transactions:orderbeingprocessed', array($gateway)); ?></h2>
            <p><?php echo __('transactions:ifyouarenotredirected', array($gateway)); ?></p>
        <?php endif; ?>
    <?php else: ?>
        <p><small><?php echo __('transactions:fee_applied', array($gateway, $fee)); ?></small></p>
    <?php endif ?>
    <?php echo $form; ?>
</div>