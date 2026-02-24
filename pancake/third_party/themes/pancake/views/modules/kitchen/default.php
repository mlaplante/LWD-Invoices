<div id="content">

        <div class="content-header">
            <?php if ($latest): ?>
            <a href="<?php echo site_url($latest->unique_id);?>" id="latest_invoice">
                <h4><?php echo __('kitchen:latest_invoice')?></h4>
                <h3><?php echo __('invoices:invoicenumber', array($latest->invoice_number)); ?></h3>
                <p>
                    <span class="paidon"><?php echo __('projects:due_date')?>: <?php echo $latest->due_date ? format_date($latest->due_date) : '<em>'.__('global:na').'</em>'; ?></span><br />
                    <span class="paidon"><?php echo __('invoices:amount')?>: <?php echo Currency::format($latest->billable_amount, $latest->currency_code); ?></span><br />
                    <?php if ($latest->is_paid) : ?>
                        <span class="paidon"><?php echo __('invoices:thisinvoicewaspaidon', array(format_date($latest->payment_date))); ?></span>
                    <?php else: ?>
                        <span class="paidon"><?php echo __('invoices:thisinvoiceisunpaid'); ?></span>
                    <?php endif; ?>
                </p>
            </a>
            <?php endif;?>

            <div class="side_border">
                <h1 class="client-name">
                    <?php echo client_name($client); ?>
                </h1>
                <h4 class="account_totals">
                    <span class="unpaid-balance"><?php echo __('kitchen:unpaid_balance', array($client_totals["unpaid"])) ?></span><br />
                    <span class="total-to-date"><?php echo __('kitchen:total_paid_to_date', array($client_totals["paid"])); ?></span><br />
					<?php if ($this->clients_m->get_has_had_credit($client->id)): ?>
						<span class="credit-balance"><?php echo __('global:credit_balance'); ?>: <?php echo $client_totals["credit"]; ?></span><br />
					<?php endif; ?>
					<?php echo anchor(Settings::get('kitchen_route') . "/{$client->unique_id}/comments/client/{$client->id}", __('kitchen:comments_x', [$comment_count]), 'class="button-comments ' . '"'); ?>
				</h4>
            </div>
            <div class="clear">&nbsp;</div>
        </div>


	<?php if (count($invoices)): ?>


	<h2 class="invoices_heading"><?php echo __('global:invoices')?></h2>

	<table id="kitchen-invoices"  class="kitchen-table" cellpadding="0" cellspacing="0">
		<thead>
		<tr>
			<th class="column_1"><?php echo lang('invoices:number') ?></th>
			<th class="column_2"><?php echo lang('invoices:due') ?></th>
			<th class="column_3"><?php echo lang('invoices:amount') ?></th>
                        <th class="column_3"><?php echo __('global:paid') ?></th>
                        <th class="column_3"><?php echo __('global:unpaid') ?></th>
			<th class="column_4"><?php echo lang('invoices:is_paid') ?></th>
			<th class="column_5"><?php echo lang('global:notes') ?></th>
		</tr>
		</thead>
		<?php foreach ($invoices as $invoice): ?>
			<tr class="border-top">
				<td colspan="7">
					<div id="border-holder-top">
					</div><!-- /border-holder-top -->
				</td>
			</tr><!-- /top-border -->
			<tr class="items-desc-row <?php echo ($invoice->paid ? 'paid' : 'unpaid'); ?>-invoice">
			<td class="number-col"><?php echo $invoice->invoice_number; ?></td>
			<td class="date-col"><?php echo $invoice->due_date ? format_date($invoice->due_date) : '<em>'.__('global:na').'</em>';?></td>
			<td class="currency-col"><?php echo Currency::format($invoice->billable_amount, $invoice->currency_code); ?></td>
			<td class="currency-col"><?php echo Currency::format($invoice->paid_amount, $invoice->currency_code); ?></td>
			<td class="currency-col"><?php echo Currency::format($invoice->unpaid_amount, $invoice->currency_code); ?></td>
			<td class="status-col status_<?php echo ($invoice->paid ? 'paid' : 'unpaid'); ?>"><?php echo __($invoice->paid ? 'global:paid' : ($invoice->paid_amount > 0 ? "invoices:partially_paid" : 'global:unpaid')); ?></td>
			<td class="comments-col">
				<?php echo anchor($invoice->unique_id, lang('invoices:view')); ?>
				<?php echo anchor(Settings::get('kitchen_route').'/'.$client->unique_id.'/comments/invoice/'.$invoice->id, __('kitchen:comments_x', array($invoice->total_comments))); ?>
			</td>
		</tr>
		<tr class="border-bottom">
			<td colspan="7">
				<div id="border-holder-bottom">
				</div><!-- /border-holder-bottom -->
			</td>
		</tr>
		<?php endforeach ?>
	</table>


	<?php endif; //END INVOICE COUNT ?>


	<?php if (count($estimates)): ?>
	<h2><?php echo __('global:estimates'); ?></h2>

	<table id="kitchen-estimates"  class="kitchen-table" cellpadding="0" cellspacing="0">
		<thead>
		<tr>
			<th class="column_1"><?php echo __('estimates:estimatenumber', array('')) ?></th>
			<th class="column_2"><?php echo __('estimates:estimatedate') ?></th>
			<th class="column_3"><?php echo lang('invoices:amount') ?></th>
			<th class="column_4"><?php echo lang('global:status') ?></th>
			<th class="column_5"><?php echo lang('estimates:view') ?></th>
			<th class="column_6"><?php echo lang('global:notes') ?></th>
		</tr>
		</thead>
		<?php foreach ($estimates as $estimate): ?>
			<tr class="border-top">
				<td colspan="6">
					<div id="border-holder-top">
					</div><!-- /border-holder-top -->
				</td>
			</tr><!-- /top-border -->
			<tr class="items-desc-row estimate-row">
				<td class="number-col"><?php echo $estimate->invoice_number; ?></td>
				<td class="date-col"><?php echo $estimate->date_entered ? format_date($estimate->date_entered) : '<em>'.__('global:na').'</em>';?></td>
			<td  class="currency-col"><?php echo Currency::format($estimate->amount, $estimate->currency_code); ?></td>
			<td class="status-col"><?php echo __('global:'. ($estimate->status ? ($estimate->status == "ACCEPTED" ? "accepted" : "rejected") : "unanswered")); ?></td>
			<td  class="view-col">
				<?php echo anchor($estimate->unique_id, lang('estimates:view')); ?>
			</td>
			<td  class="comments-col">
				<?php echo anchor(Settings::get('kitchen_route').'/'.$client->unique_id.'/comments/invoice/'.$estimate->id, __('kitchen:comments_x', array($estimate->total_comments))); ?>
			</td>
		</tr>
		<tr class="border-bottom">
			<td colspan="6">
				<div id="border-holder-bottom">
				</div><!-- /border-holder-bottom -->
			</td>
		</tr>
		<?php endforeach ?>
	</table>
	<?php endif //END ESTIMATE COUNT ?>

        <?php if (count($credit_notes)): ?>
	<h2><?php echo __('global:credit_notes'); ?></h2>

	<table id="kitchen-estimates"  class="kitchen-table" cellpadding="0" cellspacing="0">
		<thead>
		<tr>
			<th class="column_1"><?php echo lang('invoices:amount') ?></th>
			<th class="column_2"><?php echo lang('credit_notes:view') ?></th>
			<th class="column_5"><?php echo lang('global:notes') ?></th>
		</tr>
		</thead>
		<?php foreach ($credit_notes as $estimate): ?>
			<tr class="border-top">
				<td colspan="3">
					<div id="border-holder-top">
					</div><!-- /border-holder-top -->
				</td>
			</tr><!-- /top-border -->
			<tr class="items-desc-row estimate-row">
			<td  class="currency-col"><?php echo Currency::format($estimate->amount, $estimate->currency_code); ?></td>
			<td  class="view-col">
				<?php echo anchor($estimate->unique_id, __('credit_notes:view')); ?>
			</td>
			<td  class="comments-col">
				<?php echo anchor(Settings::get('kitchen_route').'/'.$client->unique_id.'/comments/invoice/'.$estimate->id, __('kitchen:comments_x', array($estimate->total_comments))); ?>
			</td>
		</tr>
		<tr class="border-bottom">
			<td colspan="3">
				<div id="border-holder-bottom">
				</div><!-- /border-holder-bottom -->
			</td>
		</tr>
		<?php endforeach ?>
	</table>
	<?php endif //END ESTIMATE COUNT ?>

	<?php if ($projects): ?>
	<h2><?php echo __('global:projects'); ?></h2>

	<?php $prev_milestone = 'x'; ?>
	<?php foreach ($projects as $project): ?>

		<div id="project-<?php echo $project->id; ?>-holder" class="project-holder">


		<h4><?php echo $project->name; ?></h4>
			<p style="font-size:12px; color:#ccc">
				<?php echo anchor(Settings::get('kitchen_route') . '/' . $client->unique_id . '/comments/project/' . $project->id, __('kitchen:comments_x', array($project->total_comments))); ?>

				<?php if ($project->is_timesheet_viewable): ?>
					<?php echo anchor('timesheet/' . $project->unique_id, __('timesheet:view_pdf')); ?>
				<?php endif; ?>

				<?php echo lang('projects:due_date') ?>: <?php echo format_date($project->due_date); ?><br>
				<?php echo lang('projects:is_completed') ?>: <?php echo($project->completed ? __('global:yes') : __('global:no')); ?>
				<br>
			</p>

			<?php if ($project->tasks): ?>
				<div id="project-details-holder">
                    <?php $started = false; ?>
			<?php foreach ($project->tasks as $task): ?>
				<?php if ($task['milestone_name'] !== $prev_milestone): ?>
                                    <?php if ($started): ?>
                                                        </table>
                                    <?php endif; ?>
                                                        <?php $started = true;?>
                                                        <div class="milestone-container">
                                                        <h4><?php if (!empty($task['milestone_name'])): ?>
                                                            <div class="milestone-icon" style="background-color: <?php echo $task['milestone_color'] ?>"></div>
                                                        <?php endif; ?>

                                                        <?php echo (!empty($task['milestone_name']) ? $task['milestone_name'] : lang('tasks:no_milestones')); ?></h4>
                                                        <p><?php echo nl2br(escape($task['milestone_description'])); ?></p>
                                                            </div>
					<table id="kitchen-projects" class="kitchen-table" cellpadding="0" cellspacing="0">

					<tr class="milestone-title">
                                                <th><?php  echo __('timesheet:taskname') ?></th>
						<th style="white-space: nowrap;"><?php echo lang('tasks:hours') ?></th>
						<th style="white-space: nowrap;"><?php echo lang('tasks:due_date') ?></th>
						<th style="white-space: nowrap;"><?php  echo __('global:status') ?></th>
						<th style="white-space: nowrap;"><?php  echo __('global:notes') ?></th>
					</tr>

					<?php $prev_milestone = $task['milestone_name']; ?>
				<?php endif ?>

				<tr class="border-top">
					<td colspan="5">
						<div id="border-holder-top">
						</div><!-- /border-holder-top -->
					</td>
				</tr><!-- /top-border -->
				<tr class="items-desc-row task-row" >
                                        <td class="name-col" <?php if ($task['parent_id'] > 0): ?>style="padding-left: 3em;"<?php endif; ?>>
                                            <?php if ($task['completed'] == '1'): ?>
                                                <img src="<?php echo asset::get_src('bg-invoice-arrow.gif', 'img'); ?>" />  <strike><?php echo $task['name']; ?></strike>
                                            <?php else: ?>
                                                <img src="<?php echo asset::get_src('bg-invoice-arrow.gif', 'img'); ?>" />  <?php echo $task['name']; ?>
                                            <?php endif ?>
                                        </td>
					<td style="white-space: nowrap;" class="hours-col"><?php echo format_hours($task['rounded_tracked_hours']); ?></td>
					<td style="white-space: nowrap;" class="due-date-col"><?php echo $task['due_date'] ? format_date($task['due_date']) : __('global:na'); ?></td>
                                        <td style="white-space: nowrap;" class='status-col'>
                                            <?php if ($task['status_title']): ?>
                                                <span class="tag status-<?php echo $task['status_id'] ?>" style="color: <?php echo $task['font_color'] ?>; background: <?php echo $task['background_color'] ?>; text-shadow: 1px 1px <?php echo $task['text_shadow'] ?>; -webkit-box-shadow:0px 1px 1px 0px <?php echo $task['box_shadow'] ?>; -moz-box-shadow:0px 1px 1px 0px <?php echo $task['box_shadow'] ?>; box-shadow: 0px 1px 1px 0px <?php echo $task['box_shadow'] ?>" ><?php echo $task['status_title'] ?></span>
                                            <?php else: ?>
                                                <span><?php echo ($task['completed']) ? __('gateways:completed') : __('global:na'); ?></span>
                                            <?php endif ?>
                                        </td>
					<td style="white-space: nowrap;" class="comment-col">
						<?php if ($task["is_timesheet_viewable"] === null): ?>
							<?php $task["is_timesheet_viewable"] = $project->is_timesheet_viewable; ?>
						<?php endif; ?>

						<?php if ($task["is_timesheet_viewable"]): ?>
							<?php echo anchor('timesheet/' . $project->unique_id . '/html/' . $task['id'], __('timesheet:view_pdf')); ?>
						<?php endif; ?>

						<?php echo anchor(Settings::get('kitchen_route').'/'.$client->unique_id.'/comments/task/'.$task['id'], __('kitchen:comments_x', array($task['total_comments']))); ?>
					</td>
				</tr>
				<tr class="border-bottom">
					<td colspan="5">
						<div id="border-holder-bottom">
						</div><!-- /border-holder-bottom -->
					</td>
				</tr>
						<?php if (!empty(trim($task['notes']))): ?>
							<tr class="item-notes">
								<td colspan="5" class="notes-row" <?php if ($task['parent_id'] > 0): ?>style="padding-left: 3.5em;"<?php endif; ?>><?php echo auto_typography($task['notes']); ?></td>
							</tr>
						<?php endif; ?>
			<?php endforeach ?>
                                <?php $prev_milestone = 'x'; ?>
		</table><!-- /kitchen-table-->
		</div>
			<?php endif; ?>

		</div><!-- /project-<?php echo $project->id; ?>-holder -->
	<?php endforeach ?>

	<?php endif ?>



	<?php if (count($proposals)): ?>
	<h2><?php echo __('proposals:proposal') ?></h2>

	<table id="kitchen-proposals" class="kitchen-table" cellpadding="0" cellspacing="0">
		<thead>
		<tr>
			<th><?php echo __('proposals:number') ?></th>
			<th><?php echo __('proposals:proposal_title') ?></th>
			<th><?php echo __('proposals:estimate') ?></th>
			<th><?php echo __('proposals:status') ?></th>
			<th><?php  echo __('global:notes') ?></th>
		</tr>
		</thead>
		<?php foreach ($proposals as $proposal): ?>
			<tr class="border-top">
				<td colspan="5">
					<div id="border-holder-top">
					</div><!-- /border-holder-top -->
				</td>
			</tr><!-- /top-border -->
			<tr class="items-desc-row proposals-row">
			<td class="number-col"><?php echo $proposal->proposal_number; ?></td>
			<td class="title-col"><?php echo $proposal->title; ?></td>
			<td class="total-col"><?php echo ($proposal->amount > 0 ? Currency::format($proposal->amount) : __('global:na')); ?></td>
			<td class="status-col"><?php echo __('proposals:' . (!empty($proposal->status) ? strtolower($proposal->status) : 'noanswer'), array(format_date($proposal->last_status_change))); ?></td>
			<td class="anchor-col">
				<?php echo anchor('proposal/'.$proposal->unique_id, lang('proposals:view')); ?>
				<?php echo anchor(Settings::get('kitchen_route').'/'.$client->unique_id.'/comments/proposal/'.$proposal->id, __('kitchen:comments_x', array($proposal->total_comments))); ?>
			</td>
		</tr>
		<tr class="border-bottom">
			<td colspan="5">
				<div id="border-holder-bottom">
				</div><!-- /border-holder-bottom -->
			</td>
		</tr>
		<?php endforeach ?>
	</table>

	<?php endif ?>


</div><!-- /projects -->