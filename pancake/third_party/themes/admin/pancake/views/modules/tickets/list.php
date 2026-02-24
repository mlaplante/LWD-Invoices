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
				<!-- <a href="#"> -->
				<div class="image"></div>
				<div class="body">
					<h4 style="color: #777; margin-bottom: 12px; margin-top: 10px; font-size: 14px; font-style: italic;"><?php echo anchor('admin/tickets/create', __('tickets:add_a_new_ticket').' &rarr;') ?></h4>
				</div>
				<!-- </a> -->
				<br class="clear" />
			</li>
			<?php $this->load->view('tickets/ticket_list') ?>
		</ul>
	</div>

	<div id="ticket-body" class="eight columns">

	</div> 
</div>

<script>
	$("#ticket-content").scrollTop($("#ticket-content")[0].scrollHeight);
	$(".ticket-options").click(function() {
		$(".edit-ticket").toggle(300);
	});
</script>
