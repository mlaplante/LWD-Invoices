<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo __('global:plugins'); ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>
<div class="row content-wrapper" id='store-plugin-details'>
    <div class="twelve columns">
        <?php /* <div class='aside'>
          <p class='reviews'>
          <?php echo str_repeat("<img class='rating' src='" . Asset::get_src('footer-stack.png', 'img') . "'>", round($plugin['review_average'])); ?>
          <?php echo str_repeat("<img class='rating faded-rating' src='" . Asset::get_src('footer-stack.png', 'img') . "'>", 5 - round($plugin['review_average'])); ?>
          (<?php echo $plugin['review_count']; ?> review<?php echo $plugin['review_count'] == 1 ? '' : 's'; ?>)
          </p>
          <a href='<?php echo $plugin['button']['href']; ?>' class='blue-btn buy <?php echo isset($plugin['button']['class']) ? $plugin['button']['class'] : ''; ?>' <?php echo isset($plugin['button']['data-reveal-id']) ? "data-reveal-id='{$plugin['button']['data-reveal-id']}'" : ''; ?>><?php echo $plugin['button']['text']; ?></a>
          </div> */ ?>
        <h2><?php echo $plugin['title']; ?> <small><?php echo $plugin['type']; ?></small></h2>
        <h5><?php echo $plugin['version']; ?> (<?php echo format_date($plugin['release_date']); ?>) by <?php echo $plugin['display_name']; ?> (<?php echo $plugin['support_email']; ?>)</h5>
        <a href='<?php echo $plugin['button']['href']; ?>' class='blue-btn buy <?php echo isset($plugin['button']['class']) ? $plugin['button']['class'] : ''; ?>' <?php echo isset($plugin['button']['data-reveal-id']) ? "data-reveal-id='{$plugin['button']['data-reveal-id']}'" : ''; ?>><?php echo $plugin['button']['text']; ?></a>
        <hr>
        <h5>Description: </h5>
        <div class='description'><?php echo $plugin['description']; ?></div>
        <h5>What's new in <?php echo $plugin['version']; ?>: </h5>
        <div class='changelog'><?php echo $plugin['release']['changelog']; ?></div>
        <?php /* <hr> */ ?>
        <?php if (count($plugin['screenshots']) > 0): ?>
            <hr>
            <div>
                <?php foreach ($plugin['screenshots'] as $record): ?><div class='plugin-store-screenshot screenshot'><img class="img-thumbnail" src='<?php echo $this->store_m->screenshot($record['filename']); ?>' /></div><?php endforeach; ?>
            </div>
            <?php /* <hr> */ ?>
        <?php endif; ?>
        <?php /*
          <h5>Reviews: </h5>
          <?php if (count($plugin['reviews']) > 0): ?>
          <div class='row'>
          <?php $i = 1; ?>
          <?php foreach ($plugin['reviews'] as $record): ?>
          <div class='four columns plugin-review'>
          <h6><?php echo $record['title']; ?> <small>posted on <?php echo format_date($record['date_added']) ?></small></h6>
          <?php echo str_repeat("<img class='rating' src='" . Asset::get_src('footer-stack.png', 'img') . "'>", round($record['rating'])); ?>
          <?php echo str_repeat("<img class='rating faded-rating' src='" . Asset::get_src('footer-stack.png', 'img') . "'>", 5 - round($record['rating'])); ?>
          <p><?php echo $record['contents']; ?></p>
          </div>
          <?php if ($i == 3): ?>
          <?php $i = 0; ?>
          </div><div class='row'>
          <?php endif; ?>
          <?php $i++; ?>
          <?php endforeach; ?>
          </div>
          <?php else: ?>
          <p>This plugin doesn't have any reviews yet.</p>
          <?php endif; ?>
         */ ?>
    </div>
</div>
<?php $this->load->view('buy_with_modal'); ?>