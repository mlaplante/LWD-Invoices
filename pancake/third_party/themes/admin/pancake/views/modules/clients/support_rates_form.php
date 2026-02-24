<div class="modal-form-holder">
    <div id="form_container">
            <div id="modal-header">
                <div class="row">
                    <h3 class="ttl ttl3"><?php echo __('clients:support_rates'); ?></h3>
                </div>
            </div>
            <div class="form-holder">
                <?php echo form_open('admin/clients/edit_support_rates/', 'id="support-rates-mod"'); ?>
                <input type="hidden" name="client_id" value="<?php echo $client_id; ?>" />
                <div class="row">
                    <table class="pc-table" cellspacing="0" style="width: 100%;">
                        <thead>
                            <tr>    
                                <th><?php echo __('global:title') ?></th>
                                <th><?php echo __('settings:default_rate') ?></th>
								<th><?php echo __('items:tax_rate') ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($ticket_priorities as $priority): ?>
                                <tr>
                                    <td><?php echo form_input(array(
                                        'name' => 'ticket_priorities[' . $priority->id . '][title]',
                                        'value' => set_value('ticket_priorities[' . $priority->id . '][title]', $priority->title),
                                        'class' => 'txt small',
                                        'readonly' => 'readonly'
                                        ));?>
                                    </td>
                                    <td>
                                        <?php echo form_input(array(
                                            'name' => 'ticket_priorities[' . $priority->id . '][rate]',
                                            'value' => set_value('ticket_priorities[' . $priority->id . '][rate]', $priority->default_rate),
                                            'class' => 'txt small'
                                        ));?>
                                    </td>
									<td class="tax-row tax-dropdown"><span class="dropdown-arrow"><?php echo form_dropdown('ticket_priorities[' . $priority->id . '][tax_id]', Settings::tax_dropdown(), set_value('ticket_priorities[' . $priority->id . '][tax_id]'), 'class="tax_id"'); ?></span></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
    				<div class="eight columns">
    				</div><!-- /eight columns -->
    				<div class="four columns">
    					<p><a href="#" class="blue-btn js-fake-submit-button"><span><?php echo __('clients:edit_support_rates'); ?>&rarr;</span></a></p>
    				</div><!-- /four columns -->
                </div>
                <input type="submit" class="hidden-submit" />
    			<?php echo form_close(); ?>
            </div><!-- /form holder-->
    </div> <!-- /form-container -->
</div><!-- /modal-form-holder -->