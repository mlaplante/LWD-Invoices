<?php 
/*
 * View Time Sheet Entries Page
 * Version 2 (Created: 06th January 2013)
 */
?>

<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3"><?php echo __('tickets:all_tickets') ?></h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>

<?php $this->load->view('sort'); ?>

<div class="row mailpane">	
	<div id="ticket-feed" class="four columns">
		<ul>
			<li class="ticket-item add">
				<a href="#">
				<div class="image"></div>
				<div class="body">
					<h4 style="color: #777; margin-bottom: 12px; margin-top: 10px; font-size: 14px; font-style: italic;"><?php echo __('tickets:add_a_new_ticket');?> &rarr;</h4>
				</div>
				</a>
				<br class="clear" />
			</li>
			<?php $this->load->view('tickets/ticket_list') ?>
		</ul>
	</div>

	<div id="ticket-body" class="eight columns">
		<?php /* CREATE NEW TICKET */ ?>
		<div id="ticket-actions">
			<div class="row">
				<div class="twelve columns"><strong><?php echo __('tickets:create_a_new_ticket'); ?></strong></div>
			</div>
		</div>
		
		<div id="ticket-create">

			<?php echo form_open(null, array('class' => 'form-holder row')) ?>
				<div class="six columns">
				    <label for="client"><?php echo __('tickets:select_client'); ?></label>
				    <span class="sel-item">
						<?php echo form_dropdown('client_id', $clients_dropdown, set_value('client_id'),'class="sel_client"'); ?>
				    </span>
				</div>

				<div class="six columns">
				    <label for="user"><?php echo __('tickets:assign_to_user'); ?></label>
				    <span class="sel-item">
						<?php echo form_dropdown('assigned_user_id', $users_select, set_value('assigned_user_id'), 'class="txt"'); ?>
				    </span>
				</div>

				<div class="twelve columns">
					<label for="subject"><?php echo __('tickets:ticket_subject'); ?></label>
					<input type="text" id="subject" name="subject">
				</div>

				<div class="twelve columns">
					<label for="message"><?php echo __('tickets:ticket_message'); ?></label>
					<div class="textarea ticket">
						<?php
							echo form_textarea(array(
								'name' => 'message',
								'id' => 'message',
								'value' => '',
								'rows' => 7,
								'cols' => 50
							), '', 'class="redactor"');
						?>
					</div>
				</div>

				<div class="six columns">
				    <label for="priority"><?php echo __('tickets:ticket_priority'); ?></label>
				    <span class="sel-item">
						<?php echo form_dropdown('priority_id', $priorities, set_value('priority_id'), 'class="sel_priority"'); ?>
				    </span>
				</div>

				<div class="six columns end">
				    <label for="status"><?php echo __('tickets:ticket_status'); ?></label>
				    <span class="sel-item">
						<?php echo form_dropdown('status_id', $statuses, set_value('status_id')); ?>
				    </span>
				</div>

				<input type="hidden" name="is_billable" class="ticket_is_billable" value="0" />
				<input type="hidden" name="ticket_amount" class="ticket_amt" value="0" />
				<div class="twelve columns">
					<input type="submit" id="submit" class="blue-btn" value="Add Ticket">
				</div>
			</form>
		</div>

	</div> 
</div>

<?php asset::js('tickets/create.js', array(), 'secondary-js'); ?>
<script>
	//$("#ticket-content").scrollTop($("#ticket-content")[0].scrollHeight);
	$('#ticket-body').ticket_create({
		base_url: '<?php echo site_url(); ?>' 
	});

	$(".ticket-options").click(function() {
		$(".edit-ticket").toggle(300);
	});
</script>
