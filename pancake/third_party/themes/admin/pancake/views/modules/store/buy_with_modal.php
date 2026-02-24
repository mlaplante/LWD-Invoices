<div id='buy-with-modal' class="reveal-modal" style='width: 400px;'>
    <h4>Login with your pancakeapp.com account to purchase this item:</h4>
    <input type="text" class='pancakeapp_email' value="<?php echo Settings::get('store_auth_email')?>" />
    <input type='password' class="pancakeapp_password" />
    <a href='#' class='pancakeapp_submit blue-btn'>Purchase</a>
    <a href='#' class='pancakeapp_cancel blue-btn'>Cancel</a>
</div>
<div id='install-with-modal' class="reveal-modal" style='width: 400px; text-align: center; padding: 40px;font-size: 2em;'>
    Installing, please wait...
</div>

<div id='download-free' class="reveal-modal" style='width: 500px; text-align: center; padding: 40px;'>
    <p style="font-size: 2em;margin-bottom:0;">Downloading, please wait...</p>
    <p style="font-size: 1.25em;margin-top:0;">This might take a few minutes.</p>
</div>

<div id='already-purchased' class="reveal-modal" style='width: 500px; text-align: center; padding: 40px;'>
    <p style="font-size: 2em;margin-bottom:0;">Already purchased</p>
    <p style="font-size: 1.25em;margin-top:0;">This item is free because you've previously purchased it.</p>
</div>

<div id='buy-with-modal-loading' class="reveal-modal" style='width: 400px; text-align: center;padding: 40px;'>
    <p style="font-size: 2em;">Verifying, please wait...</p>
    <p style="font-size: 1.5em;">This might take up to a minute.</p>
</div>
<div id='buy-with-modal-result' class="reveal-modal" style='width: 400px; text-align: center; padding: 40px;'>
    <div class='modal-content'></div>
</div>
<script>
var plugins_update_url = '<?php echo site_url('admin/store/update')?>';
</script>