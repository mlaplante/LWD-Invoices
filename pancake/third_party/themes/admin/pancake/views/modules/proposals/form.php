<div id="form_container">
    <div id="modal-header">
        <div class="row">
            <h3 class="ttl ttl3"><?php echo lang('proposals:' . $action . 'proposal'); ?></h3>
        </div>
    </div>

    <div class="form-holder row">
        <?php echo form_open('admin/proposals/' . $action, array('id' => 'create_form')); ?>

            <div class="row add-bottom">
                <div class="twelve columns">
                    <label for="name"><?php echo lang('global:title'); ?></label>
                    <?php echo form_input('title', set_value('title', isset($proposal) ? $proposal->title : ''), 'class="txt"'); ?>
                </div><!-- /12 -->
            </div><!-- /row -->
                
            <div class="row add-bottom">
                <div class="six columns">
                    <label for="client_id"><?php echo lang('global:client'); ?></label>

                    <span class="sel-item"><?php echo form_dropdown('client_id', $clients_dropdown, set_value('client_id', isset($proposal) ? $proposal->client_id : 0)); ?></span>
                
                    <?php echo anchor('admin/clients/create', '<span>' . __('clients:add') . '</span>', 'class="blue-btn"'); ?>
            
                   
                    
                </div><!-- /six -->
                
                <div class="six columns hide-estimate">
				    <label for="proposal_number"><?php echo __('proposals:number') ?></label>
				    <?php echo form_input('proposal_number', set_value('proposal_number', isset($proposal_number) ? $proposal_number : ''), 'id="proposal_number" class="txt"'); ?>
			    </div><!-- /six -->
			</div><!-- /row -->
            
            <?php assignments('proposals', isset($proposal) ? $proposal->id : 0)?>

            <div class="row align-right">
                <?php if (isset($proposal)): ?>
                    <input type="hidden" name="id" value="<?php echo $proposal->id; ?>" />
                <?php endif; ?>
                <a href="#" class="blue-btn js-fake-submit-button"><span><?php echo lang('proposals:createandedit'); ?></span></a>
            </div><!-- /row -->
        </form>
    </div><!-- /form-holder-->
</div><!-- /form container -->