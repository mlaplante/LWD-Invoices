<div id="search-form">
	<form method="get" class="search-form" action="<?php echo site_url('/admin/search'); ?>">
            <input type="text" id="search" placeholder="<?php echo __("global:search")?>" name="q" value="<?php echo isset($_GET['q']) ? $_GET['q'] : ""?>" />
	    <button type="submit">go</button>
	</form>
	<div class="quick-menu">
		<a href="#" id="qm" data-dropdown="drop1" title="Quick Add"><i class="fi-plus"></i></a>
		<ul id="drop1" data-dropdown-content class="f-dropdown" style="display:none;">
			<?php if (can_for_any_client('create', 'estimates') or can_for_any_client('create', 'invoices') or is_admin()) : ?>
		    	<?php if (can_for_any_client('create', 'invoices')): ?>
		        	<li><a href="<?php echo site_url('admin/invoices/create'); ?>" title="<?php echo lang('invoices:newinvoice') ?>"><i class="fi-page-add"></i><span><?php echo lang('invoices:newinvoice') ?></span></a></li>
				<?php endif; ?>
				<?php if (can_for_any_client('create', 'estimates')): ?>
		        	<li><a href="<?php echo site_url('admin/estimates/create_estimate'); ?>" title="<?php echo lang('estimates:createnew') ?>"><i class="fi-page-edit"></i><span><?php echo lang('estimates:createnew') ?></span></a></li>
				<?php endif; ?>
				<?php if (is_admin()): ?>
					<li><a href="<?php echo site_url('admin/clients/create/'); ?>" title="<?php echo __('clients:add'); ?>"><i class="fi-torsos"></i><span><?php echo __('clients:add'); ?></span></a></li>
				<?php endif; ?>
			<?php endif; ?>
		</ul>
	</div >
</div><!-- /#search-form -->