<h2>Your server is missing a couple of things.</h2>
<p class="fail">
    If you have any difficulty installing Pancake, don't forget:<br/>
    <strong>We can install Pancake for you, for free.</strong><br/>Just
    <a href="<?php echo PANCAKEAPP_COM_BASE_URL; ?>account/support/ticket/new">start a
        <strong>free</strong> support ticket</a>.
</p>
<p>Please fix the below errors and refresh to re-check.</p>

<table cellspacing="0" class="listtable checks-table">
    <thead>
        <tr>
            <th width="10%">Status</th>
            <th>Requirement</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>
                <span class="<?php echo $is_url_rewriting_working ? 'pass' : 'fail'; ?>"><?php echo $is_url_rewriting_working ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>Pancake must be able to reliably detect whether URL rewriting is on or off.</td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $manage_pancakeapp ? 'pass' : 'fail'; ?>"><?php echo $manage_pancakeapp ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>Your server must be able to communicate with pancakeapp.com (otherwise you won't be able to receive updates).</td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $license_valid ? 'pass' : 'fail'; ?>"><?php echo $license_valid ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>
                <?php if ($license_valid): ?>
                    Your license key is valid.
                <?php else: ?>
                    Your license key is not valid.
                <?php endif; ?>
            </td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $curl_installed ? 'pass' : 'fail'; ?>"><?php echo $curl_installed ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>The Curl PHP extension must be installed.</td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $installed['gd'] ? 'pass' : 'fail'; ?>"><?php echo $installed['gd'] ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>The GD PHP extension must be installed.</td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $installed['json'] ? 'pass' : 'fail'; ?>"><?php echo $installed['json'] ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>The JSON PHP extension must be installed.</td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $installed['dom'] ? 'pass' : 'fail'; ?>"><?php echo $installed['dom'] ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>The DOM PHP extension must be installed.</td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $installed['mysql'] ? 'pass' : 'fail'; ?>"><?php echo $installed['mysql'] ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>The MySQL (or MySQLi) PHP extension must be installed.</td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $installed['xml'] ? 'pass' : 'fail'; ?>"><?php echo $installed['xml'] ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>The XML PHP extension must be installed.</td>
        </tr>
        <tr>
            <td><span class="<?php echo $tls12 ? 'pass' : 'fail'; ?>"><?php echo $tls12 ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>Your server must be able to make TLS 1.2 connections to other servers.</td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $config_writable ? 'pass' : 'fail'; ?>"><?php echo $config_writable ? 'PASS' : 'FAIL</span>'; ?></span>
            </td>
            <td>The system/pancake/config folder must be writable.</td>
        </tr>
        <tr>
            <td>
                <span class="<?php echo $upload_writable ? 'pass' : 'fail'; ?>"><?php echo $upload_writable ? 'PASS' : 'FAIL'; ?></span>
            </td>
            <td>The uploads directory must be writable.</td>
        </tr>
    </tbody>
</table>