<h2>Error</h2>

<p>
    It looks like Pancake has not been installed. <strong>To run the installer, <?php echo anchor('', 'click here'); ?></strong>.
</p>
<p>Pancake thinks that the URL to your Pancake is:<br /><strong><?php echo BASE_URL;?></strong></p><p>Pancake thinks that you were trying to load the following page:<br /><strong><?php echo $this->uri->uri_string();?></strong></p>
<p>If you haven't installed, and the above information is incorrect, that means that Pancake is having problems making sense of your server's configurations. <a href="<?php echo PANCAKEAPP_COM_BASE_URL; ?>account/support/ticket/new">Start a <strong>free</strong> support ticket</a>, and we'll help you sort it out.</p>

<p class="fail">
    If you have any difficulty installing Pancake, don't forget:<br/>
    <strong>We can install Pancake for you, for free.</strong><br/>Just
    <a href="<?php echo PANCAKEAPP_COM_BASE_URL; ?>account/support/ticket/new">start a
        <strong>free</strong> support ticket</a>.
</p>