<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3"><?php echo lang('reminders:reminders') ?></h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>

<div class="row">
	<div class="three columns push-nine side-bar-wrapper">
            <?php $this->load->view("partials/quick_links", array("quick_links_owner" => "admin/invoices/reminders")); ?>
	</div><!-- /three columns side-bar-wrapper -->

	<div class="nine columns pull-three content-wrapper">
  		<?php if (empty($invoices)): // If there aren't invoices ?>

    		<div class="no_object_notification">
    			<h4><?php echo lang('invoices:noinvoicetitle') ?></h4>
    			<p><?php echo lang('invoices:noinvoicebody') ?></p>
    			<p class="call_to_action"><a class="blue-btn" id="create_project" href="<?php echo site_url('admin/invoices/create'); ?>" title="<?php echo lang('invoices:newinvoice') ?>"><span><?php echo lang('invoices:newinvoice') ?></span></a></p>
    		</div><!-- /no_object_notification -->

      <?php else: // else we do the following ?>

        <div class=" thirty-days invoice-group">

	<?php echo form_open('/admin/invoices/remind', 'id="reminders" name="reminders"'); ?>
	<table width="100%">
		<thead>
		<tr>
		<th><?php echo __('reminders:remind') ?></th>
		<th><?php echo __('reminders:message') ?></th>
		<th><?php echo __('reminders:due') ?></th>
		<th><?php echo __('reminders:details') ?></th>
		<th><?php echo __('reminders:log') ?></th>
		</tr>
		</thead>
		<tbody>


			<?php foreach($invoices as $invoice): ?>

				<?php
				//We need to determine which template to select by default which requires a little logic in the view
				$selected_template = null;
				$temp_days = 0;
				$days_overdue = $this->invoice_m->days_overdue($invoice->due_date);
				foreach($email_templates as $email){
					if($days_overdue > $email->days && $email->days > $temp_days){
						$temp_days = $email->days;
						$selected_template = $email->id;
					}
				}
				?>

				<tr>
					<td><input type="checkbox" name="invoice[<?php echo $invoice->real_invoice_unique_id ?>][remind]" id="invoice-<?php echo $invoice->real_invoice_unique_id ?>" /></td>
					<td>
						<select name="invoice[<?php echo $invoice->real_invoice_unique_id ?>][template]" id="<?php echo $invoice->real_invoice_unique_id ?>[email_template]">

							<?php foreach($email_templates as $email): ?>
							<option id="<?php echo $email->id ?>" value="<?php echo $email->id ?>" <?php echo ($email->id == $selected_template ? 'selected="selected"' : '') ?>><?php echo $email->name ?></option>
							<?php endforeach ?>
						</select>
					</td>
					<td>
						<?php if($invoice->overdue == 1): ?>
						<p><span style="color:#9f0000;"><?php echo __(($invoice->due_date > 0 ? "reminders:x_days_past_due"  : __("reminders:no_due_date")), array($this->invoice_m->days_overdue($invoice->due_date)));?></span></p>
						<?php else: ?>


						<p><?php echo __('partial:dueondate', array(format_date($invoice->due_date))); ?></p>
						<?php endif ?>
					</td>
					<td>
                                            <p><?php echo __('invoices:invoicenumber', array($invoice->invoice_number))?> - <?php echo $invoice->client_name ?> <?php $amount = ', estimated at <span class="unpaid-amount">'.Currency::format($invoice->amount).'</span>';?><br />
						<?php $amount = '<span class=" total-amount unpaid-amount">'.Currency::format($invoice->amount).'</span>';?>
					    <?php echo $amount;?> - <?php echo $invoice->email; ?><br />

						</p>
						<input type="hidden" name="invoice[<?php echo $invoice->real_invoice_unique_id ?>][email_address]" value="<?php echo $invoice->email ?>" />
					</td>
					<td>
						<p><?php echo ucfirst(($invoice->last_sent > 0) ? (__('invoices:lastsenton', array(format_date($invoice->last_sent), format_time($invoice->last_sent)))) : '') ?><br />
						<?php echo ucfirst(($invoice->last_viewed > 0) ? (__('proposals:lastviewed', array(format_date($invoice->last_viewed), format_time($invoice->last_viewed)))) : __('proposals:neverviewed')) ?></p>
					</td>
				</tr>

			<?php endforeach ?>
			</table>

			<a href="#" class="blue-btn js-fake-submit-button">
	          <span><?php echo lang('reminders:send') ?></span>
	        </a>
			<?php echo form_close() ?>
        </div>


      <?php endif; ?>
	</div><!-- /nine columns content-wrapper -->
</div><!-- /row -->