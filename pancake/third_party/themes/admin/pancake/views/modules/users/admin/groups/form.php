<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3">	<?php if ($this->method == 'edit'): ?>
		<?php echo sprintf(lang('groups:edit_title'), $group->name); ?>
	<?php else: ?>
		<?php echo lang('groups:add_title'); ?>
	<?php endif; ?></h2>
	<?php echo $template['partials']['search']; ?>
	 </div>
</div>

<div class="row">

<div class="form-holder nine columns">
	<div class="row">
	  <div class="twelve columns">
		<?php echo form_open(uri_string(), 'id="groupform"'); ?>

		  <label for="description"><?php echo lang('groups:name');?> <span>*</span></label>
		  <?php echo form_input('description', $group->description, ' class="txt text"');?>
			
			<label for="name"><?php echo lang('groups:short_name');?> <span>*</span></label>
	
			<?php if ( ! in_array($group->name, array('user', 'admin'))): ?>
				<?php echo form_input('name', $group->name, ' class="txt text"');?>
			<?php else: ?>
				<p><?php echo $group->name; ?></p>
			<?php endif; ?>
			
			<legend><?php echo lang('permissions:permissions') ?></legend>
			
			
<?php if ($group->name !== 'admin'): ?>

<div class="table-area" >
	<table cellspacing="0" width="100%">
		<thead>
		<tr>
			<th class="cell1">Module</th>
			<th class="cell5">Rules</th>
			<th class="cell5">Status</th>
		</tr>
		</thead>
		<tbody>
			<?php foreach ($permission_modules as $module): ?>
				

				
				<tr class="on_off" style="font-weight: normal; font-size: 14px !important;">
					
					<td style="width:40%;" valign="top">
						<label for="<?php echo $module['slug']; ?>"><?php echo $module['name']; ?></label>
					</td>
					
					<td>
						<div class="rules row" style="<?php echo array_key_exists($module['slug'], $edit_permissions) ? '' : 'display:none' ?>" valign="top">
						<?php if ( ! empty($module['roles'])): ?>
							<?php foreach ($module['roles'] as $role): ?>
								<label>
								<?php echo form_checkbox(array(
									'name' => 'module_roles[' . $module['slug'] . ']['.$role.']',
									'value' => TRUE,
									'checked' => isset($edit_permissions[$module['slug']]) AND array_key_exists($role, (array) $edit_permissions[$module['slug']]),
								 )); ?>
								 <?php echo lang($module['slug'].':role_'.$role); ?></label>
							<?php endforeach; ?>
						<?php endif; ?>
						</div><!-- /rules -->
					</td>
					
					<td style="width: 40%" valign="top">
						<?php echo form_checkbox(array(
							'name' => 'modules[' . $module['slug'] . ']', 
							'value' => TRUE,
							'checked' => array_key_exists($module['slug'], $edit_permissions),
							'id' => $module['slug'],
							'class' => 'on_off',
						)); ?>
					</td>

				</tr>
			<?php endforeach; ?>
		</tbody>
	</table>
</div><!-- /table-area -->

<?php endif ?>

		
</div>
		
	</div><!-- /row-->
		<div id="submit-holder">
			<p><a href="#" class="blue-btn js-fake-submit-button"><span><?php echo lang('global:save'); ?>&rarr;</span></a></p>
			<input type="submit" class="hidden-submit" />
		</div><!-- /submit-holder -->
		

	<?php echo form_close(); ?>

</div><!-- /invoice-block -->
</div><!-- /row -->

<script type="text/javascript">
	jQuery(function($) {
		$('form input[name="description"]').keyup($.debounce(300, function(){

			var slug = $('input[name="name"]');

			$.post(siteURL + 'ajax/url_title', { title : $(this).val() }, function(new_slug){
				slug.val( new_slug );
			});
		}));
	});
</script>


<script src="<?php echo Asset::get_src('chkb-style/script/chkb-style.js');?>"></script>
<link media="all" rel="stylesheet" type="text/css" href="<?php echo Asset::get_src('chkb-style/style.css');?>" />


<script type="text/javascript" charset="utf-8">
	$(function() {
		$('.on_off :checkbox.on_off').each(function() {
		
			var $checkbox = $(this);

			$checkbox.iphoneStyle({
				onChange : function(){ 
					$div = $checkbox.closest('tr').find('.rules');
					
					$checkbox.prop('checked') ? $div.show() : $div.hide();
				}
			});
		});
	});
 </script>