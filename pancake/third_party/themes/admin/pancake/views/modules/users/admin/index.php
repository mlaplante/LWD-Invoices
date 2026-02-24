<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo __("global:users"); ?></h2>
		<?php echo $template['partials']['search']; ?>
    </div>
</div>

<div class="row">

    <div class="three columns push-nine side-bar-wrapper">
        <?php $this->load->view("partials/quick_links", array("quick_links_owner" => "admin/users")); ?>
    </div><!-- /three columns side-bar-wrapper -->

    <div class="nine columns pull-three content-wrapper">
        <div class="table-area thirty-days">
            <br />
            <table cellspacing="0" class="pc-table users-table" style="width: 100%;">
                <thead>
                    <tr>
                        <th class="cell1">&nbsp;</th>
                        <th class="cell1"><?php echo __("global:name"); ?></th>
                        <th class="cell3"><?php echo __("global:email"); ?></th>
                        <th class="cell5"><?php echo __("global:group"); ?></th>
                        <th class="cell5"><?php echo __("global:actions"); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($users as $user): ?>
                        <tr>
                            <td data-title="Picture"><img src="<?php echo get_gravatar($user['email'], '40') ?>" class="members-pic" /></td>
                            <td data-title="Name"><?php echo anchor('admin/users/edit/' . $user['id'], $user['first_name'] . ' ' . $user['last_name'], 'class="fire-ajax"') ?></td>
                            <td data-title="Email"><?php echo mailto($user['email']) ?></td>
                            <td data-title="Group"><?php echo $user['group_description'] ?></td>
                            <td data-title="Actions">
                                <?php if (is_admin()): ?>
                                    <a href="<?php echo site_url("admin/users/".($user['active'] ? 'de' : '')."activate/" . $user['id']);?>" class="tiny button"><?php echo $user['active'] ? __("users:deactivate") : __("users:activate"); ?></a>
                                    <a href="<?php echo site_url('admin/users/edit/' . $user['id']);?>" class="fire-ajax tiny button"><?php echo __("global:edit"); ?></a>
                                    <a href="<?php echo site_url('admin/users/delete/' . $user['id']);?>" class="tiny button"><?php echo __("global:delete"); ?></a>
                                <?php else: ?>
                                    <div class="tiny button disabled"><?php echo $user['active'] ? __("users:deactivate") : __("users:activate"); ?></div>
                                    <div class="disabled tiny button"><?php echo __("global:edit"); ?></div>
                                    <div class="disabled tiny button"><?php echo __("global:delete"); ?></div>
                                <?php endif ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div><!-- /table-area -->
    </div><!-- /nine columns content-wrapper -->
</div><!-- /row -->