<?php
$clients_with_valid_payment_tokens = get_client_ids_with_valid_payment_tokens();
?>
<?php foreach ($rows as $row): ?>
    <?php
    $client_details = client_name($row->client_id);
    $client_url = site_url('admin/clients/view/' . $row->client_id);

    if (isset($row->proposal_number)) {
        $send_url = site_url("admin/proposals/send/{$row->unique_id}");
        $send_title = "global:send_to_client";
        $is_proposal = true;
        $is_invoice = false;
        $client = $row->client;
        $module = "proposals";
        $permission_module = "proposals";
        $number = "#{$row->proposal_number}: {$row->title}";
        $amount = $row->amount;
        $currency_code = null;

        if ($row->status == "ACCEPTED") {
            $status = 'paid';
            $banner = __("global:accepted");
        } elseif ($row->status == "REJECTED") {
            $status = 'overdue';
            $banner = __("global:rejected");
        } else {
            $status = '';
            $banner = __("global:unanswered");
        }
    } else {
        $client = $row;
        $module = human_invoice_type($row->type);
        $send_url = site_url("admin/$module/created/{$row->unique_id}");
        $is_proposal = false;
        $amount = $row->billable_amount;
        $currency_code = $row->currency_code;

        switch ($row->type) {
            case 'ESTIMATE':
                $is_invoice = false;
                $permission_module = "estimates";
                $title_wording = "global:estimate";
                $send_title = "estimates:send_to_client";

                if ($row->status == "ACCEPTED") {
                    $status = 'paid';
                    $banner = __("global:accepted");
                } elseif ($row->status == "REJECTED") {
                    $status = 'overdue';
                    $banner = __("global:rejected");
                } else {
                    $status = '';
                    $banner = __("global:unanswered");
                }
                break;
            case "CREDIT_NOTE":
                $is_invoice = false;
                $permission_module = "invoices";
                $title_wording = "global:credit_note";
                $send_title = "global:send_to_client";
                $status = '';
                $banner = "#{$row->invoice_number}";
                break;
            default:
                $is_invoice = true;
                $permission_module = "invoices";
                $title_wording = "global:invoice";
                $send_title = "invoices:send_to_client";

                if ($row->paid) {
                    $status = "paid";
                    $banner = __('global:paid');
                } elseif ($row->overdue) {
                    $status = "overdue";
                    $banner = __('global:overdue');
                } else {
                    $status = "unpaid";
                    $banner = __('global:unpaid');
                }
                break;
        }

        $number = __($title_wording) . " #{$row->invoice_number}";
    }

    $phone = $client->phone;
    $email = $client->email;

    ?>

    <div class="invoice-container">
        <div class="invoice-item <?php echo $is_invoice ? "invoice" : "not-invoice"; ?>" id="invoice_<?php echo $row->unique_id; ?>" data-module="<?php echo $module; ?>" data-unique-id="<?php echo $row->unique_id; ?>">
            <div class="nine columns invoice-body <?php echo $status; ?>">
                <div class="row">
                    <div class="three columns mobile-four">
                        <span class="invoice-banner <?php echo $status; ?>"><?php echo anchor("admin/$module/edit/{$row->unique_id}", $banner); ?></span>
                    </div>

                    <div class="nine columns mobile-four">
                        <h4>
                            <span class="invoice-client"><?php echo anchor("admin/$module/edit/{$row->unique_id}", $number); ?></span>

                            <span class="invoice-company">(<a class="color-inherit" href="<?php echo $client_url; ?>"><?php echo $client_details; ?></a>)</span>
                            <div class="invoice-details">
                                <?php echo ucfirst(($row->last_viewed > 0) ? (__('proposals:lastviewed', array(format_date($row->last_viewed), format_time($row->last_viewed)))) : __('proposals:neverviewed')) ?>
                                <br/>
                                <?php echo empty($email) ? '' : 'Email: ' . $email; ?> <?php echo empty($phone) ? '' : 'Phone: ' . $phone; ?>

                                <?php if (!$is_proposal): ?>
                                    <?php if ($row->auto_send and $row->last_sent == 0): ?>
                                        <br/>
                                        <?php echo __('invoices:willbesentautomatically', array(format_date($row->date_to_automatically_notify))); ?>
                                    <?php endif; ?>

                                    <?php if ($row->is_recurring) : ?>
                                        <br/>
                                        <?php if ($row->id == $row->recur_id) : ?>

                                            <?php $last_recurrence = $this->invoice_m->get_last_reoccurrence($row->id); ?>
                                            <?php if (isset($last_recurrence['id'])): ?>
                                                <?php echo __('invoices:lastreoccurrence', array(anchor('admin/invoices/edit/' . $last_recurrence['unique_id'], '#' . $last_recurrence['invoice_number']))) ?>
                                                <br/>
                                            <?php endif; ?>
                                            <?php echo __('invoices:willreoccurin', array(format_date($this->invoice_m->getNextInvoiceReoccurrenceDate($row->id)))) ?>
                                        <?php else: ?>
                                            <?php echo __('invoices:thisisareoccurrence', array(anchor('admin/invoices/edit/' . $this->invoice_m->getUniqueIdById($row->recur_id), '#' . $this->invoice_m->getInvoiceNumberById($row->recur_id)))); ?>
                                        <?php endif; ?>

                                    <?php endif; ?>
                                <?php endif; ?>
                            </div>

                        </h4>
                        <?php if (!empty($row->description)): ?>
                            <p class="item-description">
                                <small><?php echo $row->description; ?></small>
                            </p>
                        <?php endif; ?>
                    </div><!-- /ten -->
                </div><!-- /row -->

                <div class="row fixed-bottom">
                    <div class="three columns mobile-two">
                        <ul class="invoice-buttons gear-menu">
                            <li><?php echo anchor(($is_proposal ? 'proposal/' : '') . $row->unique_id, __('global:view'), array('class' => 'preview', 'title' => __('global:view'))); ?></li>
                            <?php if (can('send', $row->client_id, $permission_module, $row->id)): ?>
                                <li>
                                    <a class="email" href="<?php echo $send_url; ?>" title="<?php echo __($send_title); ?>"></a>
                                </li>
                            <?php endif; ?>
                            <?php $this->load->view("partials/quick_links_gear_menu", [
                                "quick_links_owner" => "admin/" . ($is_proposal ? "proposals" : "invoices") . "/view",
                                "include_top_level_ul" => false,
                                "data" => [
                                    "id" => $row->id,
                                    "unique_id" => $row->unique_id,
                                    "client_id" => $row->client_id,
                                    "module" => $module,
                                    "is_archived" => $row->is_archived,
                                    "project_id" => $row->project_id,
                                    "is_paid" => $is_invoice ? $row->is_paid : false,
                                    "is_sent" => ($row->last_sent > 0),
                                    "has_auto_charge" => in_array($row->client_id, $clients_with_valid_payment_tokens),
                                    "has_multiple_parts" => $is_invoice ? ($row->part_count > 1) : false,
                                ],
                            ]); ?>
                        </ul>
                    </div><!-- /two -->

                    <div class="nine columns mobile-four invoice-total">
                        <?php if ($is_invoice): ?>
                            <div style="float: right;">
                                <?php if (isset($row->type) and $row->type == 'DETAILED') : ?>
                                    <?php if ($row->paid_amount > 0) : ?>
                                        <span class="invoice-paid">
                                                    <?php echo __('global:paid') ?>: <?php echo Currency::format($row->paid_amount, $currency_code); ?>
                                                </span>
                                    <?php endif ?>
                                    <?php if ($row->unpaid_part_count > 0) : ?>
                                        <span class="invoice-unpaid">
                                                    <?php echo __('global:unpaid') ?>: <?php echo Currency::format($row->unpaid_amount, $currency_code); ?>
                                                </span>
                                    <?php endif ?>
                                <?php endif; ?>
                            </div>

                            <div style="float: left;">
                                <?php echo __("invoices:total"); ?>: <?php echo Currency::format($amount, $currency_code); ?>
                            </div>
                        <?php endif; ?>
                    </div>

                </div><!-- /row-->
            </div><!-- /invoice-item -->
            <div class="three columns mobile-four invoice-outstanding">
                <div>
                    <?php if (!$is_proposal && $row->type == 'DETAILED'): ?>
                        <p class="top-no-bottom">
                            <small><?php echo __('invoices:due') ?>: <?php echo ($row->due_date > 0) ? format_date($row->due_date) : 'n/a'; ?></small>
                        </p>
                    <?php elseif ($is_proposal || $row->type == "ESTIMATE"): ?>
                        <p class="top-no-bottom">
                            <small><?php echo __('proposals:' . (!empty($row->status) ? strtolower($row->status) : 'noanswer'), array(format_date($row->last_status_change))); ?>.</small>
                        </p>
                    <?php endif ?>

                    <span class="total-amount half-bottom">
                            <?php echo Currency::format($amount, $currency_code); ?>
                        </span>

                    <p class="no-bottom">
                        <small>
                            <?php if ($is_proposal): ?>
                                <?php echo (isset($row->last_sent) and $row->last_sent > 0) ? __('invoices:senton', array(format_date($row->last_sent))) . '' : __('global:notyetsent') . ''; ?>.
                            <?php else: ?>
                                <?php if ($row->type == 'ESTIMATE' or $row->type == 'CREDIT_NOTE') : ?>
                                    <?php echo (isset($row->last_sent) and $row->last_sent > 0) ? __('invoices:senton', array(format_date($row->last_sent))) . '' : __('global:notyetsent') . ''; ?>.
                                <?php else: ?>
                                    <?php if (isset($row->paid) and $row->paid) : ?>
                                        <?php echo __('invoices:paidon', array(format_date($row->payment_date))); ?>.
                                    <?php else: ?>
                                        <?php echo (isset($row->last_sent) and $row->last_sent > 0) ? __('invoices:senton', array(format_date($row->last_sent))) . '' : __('global:notyetsent') . ''; ?>.
                                    <?php endif; ?>
                                <?php endif; ?>
                            <?php endif; ?>
                        </small>
                    </p>
                </div>
            </div><!-- /total-->
        </div><!-- /row -->
    </div>
    <br class="clear"/> <br/>

<?php endforeach; ?>