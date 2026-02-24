<h2>Let's make some Pancakes!</h2>
<?php
$errors = validation_errors(' ', '<br />');
$has_errors = ($errors || isset($error));
?>
<p class="<?php echo $has_errors ? "fail" : ""; ?>">
    If you have any difficulty installing Pancake, don't forget:<br/>
    <strong>We can install Pancake for you, for free.</strong><br/>Just
    <a href="<?php echo PANCAKEAPP_COM_BASE_URL; ?>account/support/ticket/new">start a
        <strong>free</strong> support ticket</a>.
</p>
<hr>

<?php if (isset($error)): ?>
    <p class="notification error"><?php echo $error; ?></p>
<?php endif; ?>
<?php if ($errors): ?>
    <p class="notification error"><?php echo $errors; ?></p>
<?php endif; ?>

<form method="post" action="" id="form" name="form">
    <p>Enter your database connection settings.</p>
    <table style="width: 100%;">
        <tr>
            <th class="col1"><label for="db_host">Database Host:</label></th>
            <td class="col2">
                <input id="db_host" name="db_host" type="text" size="20" value="<?php echo set_value("db_host", "localhost"); ?>"/>
            </td>
            <td class="col3">localhost or an ip (192.168.0.1)</td>
        </tr>
        <tr>
            <th class="col1"><label for="db_port">Database Port:</label></th>
            <td class="col2">
                <input id="db_port" name="db_port" type="text" size="20" value="<?php echo set_value("db_port", "3306"); ?>"/>
            </td>
            <td class="col3">Which port is MySQL running on? Usually 3306.</td>
        </tr>
        <tr>
            <th class="col1"><label for="db_name">Database Name:</label></th>
            <td class="col2">
                <input id="db_name" name="db_name" type="text" size="20" value="<?php echo set_value("db_name"); ?>"/>
            </td>
            <td class="col3">The name of the database to use.</td>
        </tr>
        <input name="dbprefix" type="hidden" value="pancake_"/>
        <tr>
            <th class="col1"><label for="db_user">Username:</label></th>
            <td class="col2">
                <input id="db_user" name="db_user" type="text" size="20" value="<?php echo set_value("db_user"); ?>"/>
            </td>
            <td class="col3">Your MySQL username.</td>
        </tr>
        <tr>
            <th class="col1"><label for="db_pass">Password:</label></th>
            <td class="col2"><input id="db_pass" name="db_pass" type="password" size="20" value=""/>
            </td>
            <td class="col3">Your MySQL password.</td>
        </tr>
    </table>
    <br/>
    <p>Enter the login details you want to use for Pancake.</p>
    <table style="width: 100%;">
        <tr>
            <th class="col1"><label for="username">Admin Username</label></th>
            <td class="col2">
                <input id="username" name="username" type="text" size="20" value="<?php echo set_value('username', 'admin'); ?>"/>
            </td>
            <td class="col3">What you want to login with.</td>
        </tr>

        <tr>
            <th class="col1"><label for="password">Password</label></th>
            <td class="col2"><input id="password" name="password" type="password" size="20"/></td>
            <td class="col3">Choose a password.</td>
        </tr>

        <tr>
            <th class="col1"><label for="password_confirm">Confirm Password</label></th>
            <td class="col2"><input id="password_confirm" name="password_confirm" type="password" size="20"/></td>
            <td class="col3">Confirm the password.</td>
        </tr>

    </table>
    <br/>

    <p class="center">
        <button type="submit" class="button">Mmmm... Let's Eat!</button>
    </p>
</form>