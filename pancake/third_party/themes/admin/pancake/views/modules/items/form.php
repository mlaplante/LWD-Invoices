<div id="modal-form-holder" class="add_hours_container">
		<div id="modal-header">
			<div class="row">
					<h3 class="ttl ttl3"><?php echo lang('items:'.$action_type); ?></h3>
			</div>
		</div>

	 <div class="form-holder row">
  	 <?php echo form_open('admin/items/'.$action, 'id="item-mod"'); ?>
		   <fieldset class="add_item">
					<div class="row">
						<!-- Add item: Name -->
					  <div class="twelve columns add-bottom">
					    <label for="name"><?php echo lang('items:name') ?>:</label>
						  <?php echo form_input('name', set_value('name'), 'id="name" class="txt"'); ?>
					  </div><!-- /six name -->
					</div><!-- /row -->
					
					<div class="row">
						<!-- Add item: Quantity -->
					  <div class="six columns add-bottom">
						  <label for="qty"><?php echo lang('items:qty_hrs') ?></label>
						  <?php echo form_input('qty', set_value('qty', 1), 'id="qty" class="txt numeric"'); ?>
					  </div><!-- /six qty -->
			   		
			   		<!-- Add item: Rate -->
			   		<div class="six columns add-bottom">
							<label for="rate"><?php echo lang('items:rate') ?></label>
							<?php echo form_input('rate', set_value('rate', '0.00'), 'id="rate" class="txt numeric"'); ?>
						</div><!-- /six rate -->
					</div><!-- /row -->
		
					<div class="row">
						<!-- Add item: Description -->
						<div class="twelve columns add-bottom">
							<label for="description"><?php echo lang('global:description') ?>:</label>
							<?php echo form_textarea(array(
								'name' => 'description',
								'id' => 'description',
								'value' => set_value('description'),
								'rows' => 2,
								'cols' => 30
							)); ?>
						</div><!-- /twelve -->
					</div><!-- /row-->
		
					<div class="row">
						<!-- Add item: Tax Rate -->
						<div class="six columns add-bottom">
							<label for="tax_ids"><?php echo lang('items:tax_rate') ?>:</label>

                                                        <select id="tax_ids" name="tax_ids[]" multiple="multiple" class="multiselect" data-nothing-selected-label="<?php echo __("settings:no_tax"); ?>">
                                                            <?php $default_tax_ids = isset($_POST['tax_ids']) ? $_POST['tax_ids'] : Settings::get_default_tax_ids(); ?>
                                                            <?php foreach (Settings::all_taxes() as $id => $tax): ?>
                                                                <option value="<?php echo $id; ?>" <?php echo (in_array($id, $default_tax_ids)) ? 'selected="selected"' : ''; ?>><?php echo $tax['name']; ?></option>
                                                            <?php endforeach; ?>
                                                        </select>
                                                        <script>$("select.multiselect").multiselect();</script>
						</div><!-- /six tax -->
		
						<div class="six columns add-bottom">
							<!-- Add item: Type -->
							<label for="type"><?php echo lang('items:type') ?>:</label>
							<span class="sel-item"><?php echo form_dropdown('type', Item_m::type_dropdown(), set_value('type'), 'class="type"'); ?></span>
						</div><!-- /six type -->
					</div><!-- /row -->
					
					<br class="clear" />
		
					<p><a href="#" class="blue-btn js-fake-submit-button"><span><?php echo lang('items:'.$action_type); ?></span></a></p>
		  
		  </fieldset>
	    
	    <input type="submit" class="hidden-submit" />
    <?php echo form_close(); ?>
  </div><!-- /form-holder -->
</div><!-- /modal-window -->