<div id="header" >
    <div class="row client-header">
        <?php if ($client->company): ?>
            <h2 class="ttl ttl3"><?php echo lang('global:client') ?>: <?php echo $client->company; ?></h2>
        <?php else: ?>
            <h2 class="ttl ttl3"><?php echo lang('global:client') ?>: <?php echo $client->first_name . ' ' . $client->last_name; ?></h2>
        <?php endif; ?>
        <?php echo $template['partials']['search']; ?>
        <div class="client-image">
            <img src="<?php echo get_gravatar($client->email, '200'); ?>" alt="<?php echo $client->first_name . ' ' . $client->last_name; ?> image"/>
        </div>
    </div>
</div>
<div class="row">
    <div class="client-contact">
        <?php if ($client->phone != '') { ?>
            <span class="contact phone"><?php echo lang('global:phone'); ?>:</span> <span class="contact-text"><?php echo $client->phone; ?></span>
        <?php } if ($client->mobile != '') { ?>
            <span class="contact mobile"><?php echo lang('global:mobile'); ?>:</span> <span class="contact-text"><?php echo $client->mobile; ?></span>
        <?php } if ($client->fax != '') { ?>
            <span class="contact fax"><?php echo lang('global:fax'); ?>:</span> <span class="contact-text"><?php echo $client->fax; ?></span>
        <?php } ?>

        <span class="contact email"><?php echo lang('global:email'); ?>:</span> <span class="contact-text"><?php echo mailto($client->email); ?></span>
        <?php if ($client->phone == '' and $client->fax == '' and $client->mobile == '') : ?><br /><?php endif; ?>
        <br />

        <?php if ($client->address != '') { ?>
            <span class="contact address">Address:</span> <span class="contact-text"><?php echo $client->company; ?>, <?php echo nl2br($client->address); ?></span>
        <?php } ?>
    </div>
</div><!-- /row-->
<div class="row">
    <div class="three columns push-nine side-bar-wrapper">
        <?php $this->load->view("partials/quick_links", [
            "quick_links_owner" => "admin/invoices/make_bulk_payment",
            "data" => [
                "client_id" => $client->id
            ]
        ]); ?>
    </div>
    <div class="nine columns pull-three content-wrapper" id="mailperson">
        <div class="form-holder" style="margin-top: 2em">
            <?php if (count($unpaid_invoices)): ?>
                <p><?php echo __('invoices:specify_bulk_payment_details'); ?></p>
                <form method="post" action="">
                    <div class="row">
                        <div class="six columns">
                            <label><?php echo __('partial:paymentmethod'); ?></label>
                            <span class="sel-item"><?php echo form_dropdown('payment-gateway', Gateway::get_enabled_gateway_select_array(false, $client->id), '', 'class=""'); ?></span>
                        </div>
                        <div class="six columns">
                            <label><?php echo __('partial:paymentdate'); ?></label>
                            <input type="text" class="text txt datePicker" name="payment-date" value="">
                        </div>
                    </div>

                    <div class="row">
                        <div class="six columns">
                            <label><?php echo __('partial:transactionid'); ?></label>
                            <input type="text" name="payment-tid" class="text txt" value="">
                        </div>
                    </div>

                    <table class="pc-table inputs-without-margin vertically-aligned-tds">
                        <thead>
                            <tr>
                                <th><?php echo __('invoices:number') ?></th>
                                <th><?php echo __('reports:unpaid_amount') ?></th>
                                <th><?php echo __('invoices:amount_to_pay') ?></th>
                            </tr>
                        </thead>
                        <tfoot>
                            <tr>
                                <td><?php echo __('invoices:x_invoices', array(count($unpaid_invoices))); ?></td>
                                <td><?php
                                    echo
                                    Currency::format(array_reduce($unpaid_invoices, function($carry, $item) {
                                                return $carry + round(Currency::convert($item->unpaid_amount, $item->currency_code, Settings::get('currency')), 2);
                                            }));
                                    ?></td>
                                <td><?php echo Currency::symbol(); ?><span class="js-total-to-be-added">0.00</span></td>
                            </tr>
                        </tfoot>
                        <tbody>
                            <?php foreach ($unpaid_invoices as $invoice): ?>
                                <tr>
                                    <td><a tabindex="-1" target="_blank" href="<?php echo site_url($invoice->unique_id) ?>"><?php echo __("invoices:invoicenumber", array($invoice->invoice_number)); ?></a></td>
                                    <td><?php echo Currency::format($invoice->unpaid_amount, $invoice->currency_code); ?></td>
                                    <td><div class='row collapse'>
                                            <div class="one mobile-one columns">
                                                <span class="prefix"><?php echo Currency::symbol($invoice->currency_code); ?></span>
                                            </div>
                                            <div class="eleven mobile-three columns">
                                                <input type="text" class="js-payment-amount-input" name="payment_amount[<?php echo $invoice->unique_id; ?>]" value="" />
                                            </div>
                                        </div></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>

                    <div class="row">
                        <div class="twelve columns">
                            <input type="checkbox" name="send_payment_notification" value="1"> <?php echo __("invoices:send_bulk_payment_notification"); ?>
                        </div>
                    </div>

                    <button type="submit" class="blue-btn"><span><?php echo __("invoices:store_bulk_payment"); ?></span></button>
                </form>
            <?php else: ?>
                <p><?php echo __("clients:has_no_unpaid_invoices", array(client_name($client))); ?></p>
            <?php endif; ?>
        </div>
    </div>
</div>