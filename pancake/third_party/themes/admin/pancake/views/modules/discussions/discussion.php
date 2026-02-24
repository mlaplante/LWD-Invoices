<?php

// Page for Project Discussion

?>

<div id="header">
     <div class="row">
       <h2 class="ttl ttl3"><?php echo __("discussions:discussion_area"); ?><br /><?php echo $item["title"]; ?></h2>
	   <?php echo $template['partials']['search']; ?>
     </div>
</div>

<div class="row" style="height: 100%;">
  <div class="nine columns content-wrapper" id="comment-holder">

      <?php if ($current_comment): ?>
          <?php $this->load->view("form", [
              "url" => "edit/{$current_comment->id}",
              "value" => $current_comment->comment,
              "title" => "kitchen:edit_comment"
          ]); ?>
      <?php endif; ?>

    <?php if (count($comments) > 0): ?>
	   <div id="comments">
      <?php foreach ($comments as $comment): ?>
        	<div class="comment <?php echo $comment->user_id == $this->current_user->id ? 'you' : ''; ?>">
	        	<div class="message">
             <?php if (isset($comment->user)): ?>
		    		    <span class="comment-img"><img src="<?php echo get_gravatar($comment->user["email"], 40) ?>" /></span>
             <?php elseif (isset($comment->client)): ?>
                <span class="comment-img"><img src="<?php echo get_gravatar($comment->client['email'], 40) ?>" /></span>
             <?php endif; ?>
            <div class="comment-body">
	            <div class="comment-dot"></div>
							<div class="comment-area <?php echo $comment->is_private ? "private": "";?>">

								<div><?php echo $this->kitchen_comment_m->display_comment($comment->comment); ?></div>

								<!-- Can we have a if has files here? This would clean up the UI of the chat system a little -->
								<div class="files">
									<ul class="list-of-files">
									<?php foreach ($comment->files as $file): ?>

										<?php $ext = explode('.', $file->orig_filename); end($ext); $ext = current($ext); ?>
								          <?php $bg = asset::get_src('file-types/'.$ext.'.png', 'img'); ?>
								          <?php $style = empty($bg) ? '' : 'style="background: url('.$bg.') 1px 0px no-repeat;"'; ?>

										<?php $ext = explode('.', $file->orig_filename); end($ext); $ext = current($ext); ?>

										<?php if($ext == 'png' OR $ext == 'jpg' OR $ext == 'gif'): ?>
											<div class="image-preview">
												<p><img src="<?php echo Pancake\Filesystem\Filesystem::url($file->real_filename);?>" style="max-width:50%" /></p>
											</div>
										<?php endif ?>


										<li><a class="file-to-download" <?php echo $style;?> href="<?php echo site_url(Settings::get('kitchen_route').'/'.$client['unique_id'].'/download/'.$comment->id.'/'.$file->id);?>"><?php echo $file->orig_filename;?></a></li>

							  		<?php endforeach; ?>
									</ul>
								</div><!-- /files -->
							</div><!-- /comment-area -->

							<br class="clear" />

							<div class="comment-details">
								<?php echo __("global:by_x_with_time", array($comment->user_name, "<abbr title='" . format_date($comment->created, true) . "'>" . better_timespan($comment->created) . "</abbr>")); ?> <?php echo $comment->is_private ? __("global:private_comment") : ""; ?>

                                <?php if (is_admin() || current_user() == $comment->user_id): ?>
                                    <p class="comment-meta pull-right">
                                        <a class="tiny button comment_edit_link" href="<?php echo site_url("admin/discussions/edit/{$comment->id}"); ?>"><?php echo __('global:edit'); ?></a>
                                        <a class="tiny button comment_delete_link js-confirm-delete-comment" href="<?php echo site_url("admin/discussions/delete/{$comment->id}"); ?>"><?php echo __('global:delete'); ?></a>
                                    </p>
                                <?php endif; ?>
                            </div>
					</div><!-- /comment-body -->
				</div><!--/message -->
	    </div><!-- /comment -->
    <?php endforeach; ?>
  </div><!-- /comments -->
    <?php endif; ?>

      <?php if (!$current_comment): ?>
          <?php $this->load->view("form", [
                  "url" => "post/$item_type/$item_id",
                  "value" => $last_inputted_comment,
                  "title" => "kitchen:submitcomment"
          ]); ?>
      <?php endif; ?>

  </div><!-- /nine columns content-wrapper-->

<div class="three columns side-bar-wrapper">

    <?php $this->load->view("partials/quick_links", [
        "quick_links_owner" => "admin/discussions",
        "data" => [
            "item_type" => $item_type,
            "item_id" => $item_id,
            "client_id" => $client_id,
        ],
    ]); ?>

	<div class="panel">
		<h4 class="sidebar-title"><?php echo __('kitchen:people_in_discussion') ?></h4>
		<ul class="active-users">
            <?php foreach ($chatters as $chatter): ?>
                <li><img src="<?php echo get_gravatar($chatter['email'], 35); ?>" /> <span><?php echo $chatter['first_name'] . " " . $chatter['last_name']; ?></span> </li>
            <?php endforeach; ?>
		</ul>

		<br class="clear"/>
                
	</div><!-- /panel -->
</div><!-- /three columns side-bar-wrapper -->

</div><!-- row -->
<?php echo asset::js('jquery.history.js'); ?>
<script type="text/javascript">
    var client_id = <?php echo $client_id;?>;

    $.history.init(function(hash){
        if(hash == "create") {
        $(document).ready(function() {
            $('#create_project').click();
        });
        } else {
        }
    },
    { unescape: ",/" });
</script>