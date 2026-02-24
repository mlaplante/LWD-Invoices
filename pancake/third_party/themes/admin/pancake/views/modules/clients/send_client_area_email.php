<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo __('clients:send_client_area_email'); ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>
<div class="row">
    <div class="nine columns content-wrapper" id="mailperson">
        <?php if ($client['email'] != ''): ?>
            <?php echo form_open("admin/clients/send_client_area_email/{$client['id']}"); ?>
            <br />
            <p>Fill out the form below and Pancake will send your client his or her client area details for you.</p>
            <label for="email"><?php echo __('global:to') ?>: </label>
            <input type="text" id="email" name="email" class="txt" value="<?php echo $client['email']; ?>">
            <label for="subject"><?php echo __('global:subject') ?>: </label>
            <input type="text" id="subject" name="subject" class="txt" value="<?php echo get_email_template('client_area_details', 'subject'); ?>">
            <textarea name="message" rows="15" style="height:200px"><?php echo get_email_template('client_area_details', 'message'); ?></textarea>
            <br />
            <p><a href="#" class="blue-btn js-fake-submit-button"><span><?php echo __('global:send_to_client') ?> &rarr;</span></a></p>
            </form>
        <?php else: ?>
            <p><?php echo __('clients:you_cannot_send'); ?></p>
        <?php endif; ?>
    </div>
    <div class="three columns">
        <p>You are sending your client the following details:</p>
        <?php if ($client['passphrase']): ?>
            <p><strong>Passphrase:</strong><br /><input type="text" value="<?php echo $client['passphrase']; ?>"></p>
        <?php endif; ?>
        <p><strong>Client Area URL:</strong><br /><input type="text" value="<?php echo $client['access_url']; ?>"></p>
    </div>
</div>