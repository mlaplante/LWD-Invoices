<?php if (count($rows)): ?>
    <div class="client-activity">
        <ol class="activity">
            <?php foreach ($rows as $row): ?>
                <?php
                $client_details = trim($row->client_name);
                $buffer = trim(isset($row->proposal_number) ? $row->client_company : $row->company);
                $client_details = empty($buffer) ? $client_details : $client_details . ' - ' . $buffer;
                $phone = isset($row->proposal_number) ? $row->client->phone : $row->phone;
                $email = isset($row->proposal_number) ? $row->client->email : $row->email;

                $client_url = site_url('admin/clients/view/' . (isset($row->proposal_number) ? $row->client->id : $row->client_id));
                ?>
                <?php $permission_module = isset($row->proposal_number) ? 'proposals' : 'invoices'; ?>
                <li class="activity-invoice-viewed"  style="font-size:1em; <?php echo ($row->overdue == 1) ? 'border-left-color: #CA6040;' : '' ?>" >
                    #<?php echo anchor('admin/' . (isset($row->proposal_number) ? 'proposals/send' : (($row->type == 'ESTIMATE') ? 'estimates' : 'invoices') . '/created') . '/' . $row->unique_id, $row->invoice_number, array('class' => 'email', 'title' => __('global:send_to_client'))); ?>
                    <?php echo $client_details; ?> - <span style="<?php echo ($row->overdue == 1) ? 'color: #CA6040;' : '' ?>"><?php echo Currency::format($row->billable_amount, $row->currency_symbol); ?></span><br />
                    <i class="fa fa-calendar"></i> <strong><?php echo ($row->due_date > 0) ? format_date($row->due_date) : 'n/a'; ?></strong> | <?php echo (isset($row->last_sent) and $row->last_sent > 0) ? __('invoices:senton', array(format_date($row->last_sent))) . '' : __('global:notyetsent') . ''; ?>
                </li>
            <?php endforeach; ?>
        </ol>
        <a href="<?php echo site_url("admin/invoices/unpaid") ?>" class="view-more"><?php echo __("dashboard:view_all_outstanding_invoices"); ?>  <i class="fi-arrow-right"></i></a>
    </div>
<?php else: ?>
    <?php echo __("dashboard:there_are_no_upcoming_invoices"); ?>
<?php endif; ?>