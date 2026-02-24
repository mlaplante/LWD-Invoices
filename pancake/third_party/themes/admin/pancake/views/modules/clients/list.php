<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3"><?php echo lang('global:clients'); ?></h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>

<div class="row">
    <div class="three columns push-nine side-bar-wrapper">
        <?php $this->load->view("partials/quick_links", array("quick_links_owner" => "admin/clients")); ?>
        <div class="panel">
        <h4 class="sidebar-title"><?php echo __("clients:filter_clients"); ?></h4>
        <p><ul id="letter-filter" class="block-grid">
           <li class="avaliable"><a<?php echo $filter ? '' : ' class="active"'; ?>  href="<?php echo site_url('/admin/clients'); ?>"><?php echo __("clients:all"); ?></a></li>
           <?php foreach (range('a', 'z') as $letter): ?>
             <li class="avaliable">
              <a href="<?php echo site_url('/admin/clients/index/0/' . $letter); ?>" <?php echo $filter == $letter ? ' class="active"' : ''; ?>>
                <?php echo strtoupper($letter); ?>
              </a>
            </li>
           <?php endforeach; ?>
        </ul></p>
    </div><!-- /panel -->
</div><!-- /three columns side-bar-wrapper -->

<div class="nine columns pull-three content-wrapper">
		<div id="ajax_container"></div>

		<?php if (empty($clients) && !$filter): ?>
  		<div class="no_object_notification">
  			<h4><?php echo lang('clients:noclienttitle') ?></h4>
  			<p><?php echo lang('clients:noclientbody') ?></p>
  			<p class="call_to_action"><a href="<?php echo site_url('admin/clients/create'); ?>" title="<?php echo lang('clients:add') ?>" class="blue-btn"><span><?php echo lang('clients:add') ?></span></a></p>
  		</div><!-- /no_object_notification -->
    <?php elseif (empty($clients) && $filter): ?>
      <div class="no_object_notification">
        <h4><?php echo lang('clients:noclienttitlefilter') ?></h4>
        <p><?php echo __('clients:noclientbodyfiltered', array($filter)) ?></p>
        <p class="call_to_action"><a href="<?php echo site_url('admin/clients/'); ?>" title="<?php echo lang('clients:removefilter') ?>" class="blue-btn"><span><?php echo lang('clients:removefilter') ?></span></a></p>
      </div><!-- /no_object_notification -->

		<?php else: ?>

		<div class="panel">

		<div id="client-wrapper" class="panel">
			<?php foreach ($clients as $row): ?>
				<?php $this->load->view('row', array('row' => $row));?>
			<?php endforeach; ?>
		</div> <!-- /client-wrapper -->
		</div>
		<div class="pagination">
			<?php echo $this->pagination->create_links(); ?>
		</div><!-- /pagination -->

		<?php endif; ?>

</div><!-- /nine columns content-wrapper -->

</div>

