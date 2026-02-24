<?php if (count($projects)): ?>
<?php foreach ($projects as $project): ?>
    <div class="row" style="margin-bottom: 1em;">
        <div class="twelve columns">
            <p style="margin:0; padding:0; font-size: 1.2em; line-height: 1.2em"><a href="<?php echo site_url("admin/projects/view/".$project['id'])?>"><?php echo $project['name'];?></a></p>
            <p style="margin: 0"><i><?php echo client_name($project['client_id']);?></p>
        </div><!-- /eight columns -->

    </div><!-- /row -->
<?php endforeach; ?>
<?php else: ?>
    <?php echo __('projects:noprojecttitle'); ?>
<?php endif; ?>
