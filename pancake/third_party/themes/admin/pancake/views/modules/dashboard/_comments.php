<?php if (count($comments)): ?>
    <div class="panel radius" id="my-discussions">
        <?php if (!isset($view_all) or $view_all): ?>
            <header>
                <h4><i class="fi-comments"></i> <?php echo __("dashboard:latest_comments") ?></h4>
            </header>
        <?php endif; ?>
        <ol class="discussion-list">
            <?php foreach ($comments as $comment): ?>
                <li class="discussion-details">
                    <h4><a href="<?php echo $comment->url_for_logged_in_users; ?>"><?php echo character_limiter($comment->comment, 80); ?></a> <span><?php echo __("dashboard:written_by", array("<strong>{$comment->user_name}</strong>", format_date($comment->created, true))) ?></h4>
                </li>
            <?php endforeach; ?>
        </ol>
        <?php if (!isset($view_all) or $view_all): ?>
            <a href="<?php echo site_url("admin/dashboard/all_comments") ?>" class="view-more"><?php echo __("dashboard:view_all_comments") ?> <i class="fi-arrow-right"></i></a>
            <?php endif; ?>
    </div>
<?php endif; ?>