<div id="header">
  <div class="row">
     <h2 class="ttl ttl3"><?php echo __("search:results_for_x", array(htmlentities($query)))?></h2>
	 <?php echo $template['partials']['search']; ?>
  </div>
</div>


<div class="row content-wrapper">
  <div class="twelve columns">
  	<div data-alert class="alert-box <?php echo ($totalResults > 0) ? 'success' : 'alert'; ?>" style="margin-top:2em">
		<?php echo __($totalResults == 1 ? "search:one_matching_result" : "search:x_matching_results", array($totalResults)); ?>
  	</div>

    <?php foreach ($results as $type => $type_results): if (empty($type_results)) continue; ?>

        <h3 class="ttl ttl3 <?php echo strtolower($type).'-header' ?>"><?php echo __("global:$type"); ?></h3>

				<?php //START OF CLIENT SWITCH ?>
            <?php if ($type == 'clients'): ?>
                <?php foreach ($type_results as $row): ?>
                    <div id="client-wrapper" class="panel">
                        <?php $this->load->view('clients/row', array('row' => $row));?>
                    </div>
                <?php endforeach; ?>
            <?php endif ?>
				<?php // END OF CLIENTS SWITCH  ?>


				<?php //START OF INVOICES SWITCH ?>
				<?php if($type == 'invoices'): ?>
				  <div class="invoice-group">
			  	  <?php $this->load->view('reports/table', array('rows' => $type_results)); ?>
				  </div>
				<?php endif ?>
				<?php // END OF INVOICES SWITCH  ?>

        <?php //START OF ESTIMATES SWITCH ?>
				<?php if($type == 'estimates'): ?>
				  <div class="invoice-group">
            <?php $this->load->view('reports/table', array('rows' => $type_results)); ?>
          </div>
				<?php endif ?>
				<?php // END OF ESTIMATES SWITCH  ?>


				<?php //START OF PROPOSALS SWITCH ?>
				<?php if($type == 'proposals'): ?>
					<div class="invoice-group">
			      <?php $this->load->view('reports/table', array('rows' => $type_results)); ?>
				  </div>
				<?php endif ?>
				<?php // END OF PROPOSAL SWITCH  ?>


				<?php //START OF PROJECTS SWITCH ?>
				<?php if($type == 'projects'): ?>
					<?php $this->load->view('projects/_projects_row', array('rows' => $type_results)); ?>
				<?php endif ?>
				<?php // END OF PROJECTS SWITCH  ?>

		  <?php endforeach; ?>

  </div><!-- /nine -->

  <div class="three columns side-bar-wrapper">
    <div class="panel">
    </div>
  </div>

</div><!-- /row -->