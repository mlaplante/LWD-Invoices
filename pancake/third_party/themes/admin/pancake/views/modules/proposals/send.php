<div id="header">
	 <div class="row">
	   <h2 class="ttl ttl3"><?php echo __('Success!'); ?></h2>
	   <?php echo $template['partials']['search']; ?>
	 </div>
</div>

<div class="row">

<div class="three columns push-nine">

	<p>You have added a proposal for

		<?php if($proposal['client']->email != ''): ?>
			<a href="mailto:<?php echo $proposal['client']->email;?>"><?php echo $proposal['client']->name;?></a> <?php if($proposal['client']->company != ''){?>, from <?php echo $proposal['client']->company;?>, <?php }?>
		<?php else: ?>
			<?php if ($proposal['client']->name != ''): ?>
			  <?php echo $proposal['client']->name; ?>, from 
			<?php endif; ?>

			<?php if($proposal['client']->company != ''){?> <?php echo $proposal['client']->company;?>, <?php }?>
		<?php endif; ?>

		for the proposal <strong>#<?php echo $proposal['proposal_number'];?></strong>.
	</p>

	
	<p class="urlToSend">Here is the url to send: <a href="<?php echo site_url('proposal/'.$unique_id); ?>" class="url-to-send"><?php echo site_url('proposal/'.$unique_id); ?></a> <br /> <br /> <a href="#" id="copy-to-clipboard" class="blue-btn"><span>Copy to clipboard</span></a></p>

</div>

<div class="nine columns pull-three" id="mailperson">
	<?php if($proposal['client']->email != ''): ?>

	<?php echo form_open('admin/proposals/send/'.$unique_id, 'id="send-proposal"'); ?>
		<input type="hidden" name="unique_id" value="<?php echo $unique_id; ?>" />

			<h3 class="ttl ttl3">Send proposal now?</h3>
			<p>Fill out the form below and we'll deliver this proposal for you.</p>
		   
		
			
				<label for="email"><?php echo __('global:to') ?>: </label>
				<input type="text" id="email" name="email" class="txt" value="<?php echo $proposal['client']->email ?>">
			
			
		
				<label for="subject"><?php echo __('global:subject') ?>: </label>
				<input type="text" id="subject" name="subject" class="txt" value="<?php echo get_email_template('new_proposal', 'subject'); ?>">

				<textarea name="message" rows="15" style="height:200px"><?php echo get_email_template('new_proposal', 'message'); ?></textarea>
	
				<a href="#" class="blue-btn js-fake-submit-button"><span><?php echo __('global:send_to_client') ?> &rarr;</span></a>
	
			
	</form>
	<?php endif;?>
</div>

</div><!--/row-->

<script src="<?php echo asset::get_src('jquery.zclip.min.js');?>"></script>
<script>
    $('a#copy-to-clipboard').each(function() {
        var that = $(this);
        that.click(function() {return false;}).zclip({
            path: '<?php echo asset::get_src('ZeroClipboard.swf', 'js')?>',
            copy: $('.url-to-send').text(),
            afterCopy:function(){
                that.find('span').width(that.width()).text('<?php echo __('global:copied');?>');
                setTimeout(function() {
                    that.find('span').text('<?php echo __('global:copytoclipboard') ?>');
                }, 500);
            }
        })
    });
</script>