<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3"><?php echo $list_title; ?></h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>

<div class="row">
	<div class="three columns push-nine side-bar-wrapper">
            <?php $this->load->view("partials/quick_links", array("quick_links_owner" => "admin/proposals")); ?>
		<div class="panel form-holder">
            <form method="get" action="<?php echo site_url(uri_string()); ?>">
					<h4 class="sidebar-title"><?php echo lang('clients:filter') ?></h4>
					<span class="sel-item"><?php echo form_dropdown('client_id', (array('0' => 'All') + $clients_dropdown), $client_id, 'class="js-submit-on-change"'); ?></span>
            </form>
		</div><!-- /panel -->
	</div><!-- /three columns side-bar-wrapper -->

	<div class="nine columns pull-three content-wrapper">
		<?php if (empty($proposals)): ?>

		    <div class="no_object_notification">
		        <h4><?php echo lang('proposals:noproposaltitle') ?></h4>

				<?php if (can_for_any_client('create', 'proposals')): ?>
		        <p><?php echo lang('proposals:noproposalbody') ?></p>
		        <p class="call_to_action"><a class="blue-btn fire-ajax" id="create_project" href="<?php echo site_url('admin/proposals/create'); ?>" title="<?php echo lang('proposals:newproposal') ?>"><span><?php echo lang('proposals:newproposal') ?></span></a></p>
				<?php endif ?>

		    </div><!-- /no_object_notification -->

		<?php else: ?>

		    <div class="invoice-group">
  		    <?php $this->load->view('reports/table', array('rows' => $proposals)); ?>
		    </div>

		    <div class="pagination">
				<?php echo $this->pagination->create_links(); ?>
		    </div>

		<?php endif; ?>
    </div><!-- /nine columns content-wrapper -->
</div><!-- /row -->