<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3"><?php echo __('global:reusableinvoiceitems'); ?></h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>

<div class="row">

<div class="nine columns content-wrapper">
		<div id="ajax_container"></div>

		<div class="reusable-items-description" style="margin-top:2em">
			<p><?php echo __('global:reusableinvoiceitems_description'); ?></p>
		</div>

		<?php if (empty($items)): ?>

		<div class="no_object_notification">
			<h4><?php echo lang('items:noitemtitle'); ?></h4>
			<p><?php echo lang('items:noitembody'); ?></p>
			<p class="call_to_action"><a href="<?php echo site_url('admin/items/create'); ?>" title="<?php echo lang('items:add'); ?>" class="blue-btn fire-ajax"><span><?php echo lang('items:add'); ?></span></a></p>
		</div><!-- /no_object_notification -->

		<?php else: ?>

		<div id="project_container">

			<div class="table-area">
				<table class="pc-table" cellspacing="0">
					<thead>
						<tr>
							<th><?php echo lang('global:name'); ?></th>
							<th><?php echo lang('global:description'); ?></th>
							<th class="table-central"><?php echo lang('items:qty_hrs'); ?></th>
			        <th class="table-central"><?php echo lang('items:rate'); ?></th>
                                <th class="table-central"><?php echo __('items:tax_rate'); ?></th>
			        <th class="table-central"><?php echo __('items:type'); ?>
							<th class="table-right"><?php echo lang('global:actions'); ?></th>
						</tr>
					</thead>
					<tbody>
					<?php foreach ($items as $item): ?>
						<tr>
							<td><?php echo $item->name; ?></td>
							<td><?php echo word_limiter($item->description, 20);?></td>
							<td class="table-central"><?php echo $item->qty; ?></td>
							<td class="table-central"><?php echo $item->rate; ?></td>
                                                        <td class="table-central"><?php echo $item->tax_label; ?></td>
							<td class="table-central"><?php echo ucfirst($item->type); ?></td>
							<td class="actions">
								<?php echo anchor('admin/items/delete/'.$item->id, lang('global:delete'), array('class' => 'icon delete', 'title' => __('global:delete'))); ?>
							  <?php echo anchor('admin/items/edit/'.$item->id, __('global:edit'), array('class' => 'icon edit fire-ajax', 'title' => __('global:edit'))); ?>

							</td>
						</tr>
					<?php endforeach; ?>
					</tbody>
				</table>
			</div>
		</div>

		<div class="pagination">
			<?php echo $this->pagination->create_links(); ?>
		</div>

		<?php endif; ?>
</div><!-- /nine columns content-wrapper -->

<div class="three columns side-bar-wrapper">
	<div class="panel">
		<h4 class="sidebar-title"><?php echo __('global:reusableinvoiceitems') ?></h4>
		<ul class="side-bar-btns">
			<li class="add"><a class="fire-ajax" href="<?php echo site_url('admin/items/create'); ?>" title="<?php echo lang('items:add') ?>"><span><?php echo lang('items:add') ?></span></a></li>
		</ul><!-- /btns-list end -->

	</div><!-- /panel -->
</div><!-- /three columns side-bar-wrapper -->

</div>