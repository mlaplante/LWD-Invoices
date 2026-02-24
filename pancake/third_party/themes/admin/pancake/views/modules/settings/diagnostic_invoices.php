<div id="header">
    <div class="row">
        <h2 class="ttl ttl3">Payments / Invoices Diagnostics</h2>
    </div>
</div>
<div class="row">
    <div class="twelve columns content-wrapper" id="mailperson">
        <div class="form-holder" style="margin-top: 2em">
            <?php if (count($bad_due_date_invoices)): ?>
                <form method="post" action="">
                    <table class="pc-table inputs-without-margin vertically-aligned-tds">
                        <thead>
                            <tr>
                                <th><?php echo __('invoices:number') ?></th>
                                <th>Recurring?</th>
                                <th>Invoice Due Date</th>
                                <th>Latest Payment's Due Date</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($bad_due_date_invoices as $invoice): ?>
                                <tr>
                                    <td>
                                        <a tabindex="-1" target="_blank" href="<?php echo site_url('admin/invoices/edit/' . $invoice["unique_id"]) ?>"><?php echo __("invoices:invoicenumber", array($invoice["invoice_number"])); ?></a>
                                    </td>
                                    <td>
                                        <?php if ($invoice["is_recurring"]) : ?>
                                            <?php if ($invoice["id"] == $invoice["recur_id"]) : ?>
                                                Yes.
                                            <?php else: ?>
                                                <?php echo __('invoices:thisisareoccurrence', array(anchor('admin/invoices/edit/' . $this->invoice_m->getUniqueIdById($invoice["recur_id"]), '#' . $this->invoice_m->getInvoiceNumberById($invoice["recur_id"])))); ?>
                                            <?php endif; ?>
                                        <?php else: ?>
                                            <?php echo __("global:no"); ?>
                                        <?php endif; ?>
                                    </td>
                                    <td><?php echo format_date($invoice["due_date"]); ?></td>
                                    <td><?php echo format_date($invoice["max_payment_due_date"]); ?></td>
                                    <td>
                                        <label style="font-weight: normal;"><input type="radio" name="correct_due_date[<?php echo $invoice["unique_id"]; ?>]" value="invoice" checked/> Keep Invoice Due Date</label>
                                        <label style="font-weight: normal;"><input type="radio" name="correct_due_date[<?php echo $invoice["unique_id"]; ?>]" value="payment"/> Use Latest Payment's Due Date</label>
                                        <label style="font-weight: normal;"><input type="radio" name="correct_due_date[<?php echo $invoice["unique_id"]; ?>]" value="nochange"/> Leave as is</label>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    <button type="submit" class="blue-btn">
                        <span>Correct Due Dates</span>
                    </button>
                </form>
            <?php else: ?>
                <p>There are no invoices with mismatched payment/invoice due dates.</p>
            <?php endif; ?>
        </div>
    </div>
</div>