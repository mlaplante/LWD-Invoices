<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3"><?php echo __('global:reports') ?></h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>

<div class="row">

<?php echo form_open(uri_string()); ?>
<div class="nine columns content-wrapper">
	<div class="overviews">
		<div class="row">
	        <?php foreach ($reports as $report) : ?>
				<?php echo $report; ?>	            
	        <?php endforeach; ?>
		  </div><!-- /row -->
	  </div><!-- /overviews -->
</div><!-- /nine columns content-wrapper -->
<?php echo form_close(); ?>

<div class="three columns side-bar-wrapper report-filters">
    <div class="filters">
        <div class="form-holder">
            <?php echo form_open(uri_string()); ?>
            <fieldset>
                <div class="row">
                    <div class="date  twelve columns">
                        <label for="client_id"><?php echo __('reports:datefrom') ?>:</label>
                        <input type="text" class="from text txt datePicker" name="from" value="<?php echo $from_input; ?>">
                        <label for="client_id"><?php echo __('reports:dateto') ?>:</label>
                        <input type="text" class="to text txt datePicker" name="to" value="<?php echo $to_input; ?>">
                    </div><!-- /date -->
				</div><!-- /row -->
				<div class="row">
                    <div class="client twelve columns">
                        <label for="client_id" class="clientlabel"><?php echo __('reports:byclient') ?>:</label>
                        <div class="sel-item"><?php echo form_dropdown('client_id', $clients_dropdown, $client_id); ?></div>


                        <label for="business_identity_id" class="clientlabel"><?php echo __("settings:business_identity") ?>:</label>
                        <div class="sel-item"><?php echo form_dropdown('business_identity_id', $business_identities_dropdown, $business_identity_id); ?></div>

                        <p style='margin-top: 2em;margin-bottom: 2.5em;'><a href="#" class="js-process-filters blue-btn"><span><?php echo __('reports:show_all') ?></span></a></p>
                    </div><!-- /client -->
                </div><!-- /row -->
            </fieldset>
            <?php echo form_close(); ?>
        </div>
    </div><!-- /filters -->
</div><!-- /three columns side-bar-wrapper -->


</div>