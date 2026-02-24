<div id="header">
    <div class="row plugins-header">
        <div class="six columns">
            <h2 class="ttl ttl3">Pancake Store</h2>
        </div>
        <div class="six columns">
            <form method='post' action='' id="search-plugins">
                <input type="text" name='term' value='<?php echo $term; ?>' placeholder="Search store..." />
                <button name='search' type="submit" class="button">Search</button>
            </form>
        </div>
    </div>
</div>
<div class="row">
    <div id='found-plugins' class='twelve columns'>
        <?php if (!is_array($plugins_store_results) or count($plugins_store_results) == 0): ?>
            <p>No results found.</p>
        <?php else: ?>
            <?php $i = 1; ?>
            <?php foreach ($plugins_store_results as $row): ?>
                <?php echo $i % 2 == 1 ? '<div class="row">' : ''; ?>
                    <div class="six columns">
                        <div class='store-plugin' data-href='<?php echo site_url('admin/store/view/' . $row['unique_id']) ?>'>
                            <a href='<?php echo $row['button']['href']; ?>' class='blue-btn buy <?php echo isset($row['button']['class']) ? $row['button']['class'] : ''; ?>' <?php echo isset($row['button']['data-reveal-id']) ? "data-reveal-id='{$row['button']['data-reveal-id']}'" : ''; ?>><?php echo $row['button']['text']; ?></a>
                            <h4><?php echo $row['title']; ?><br /><small><?php echo $row['type']; ?></small></h4>
                            <p class='last_update'><?php echo $row['version']; ?> (<?php echo format_date($row['release_date']); ?>) by <?php echo $row['display_name']; ?></p>
                            <?php /* <p class='reviews'><?php echo str_repeat("<img src='" . Asset::get_src('footer-stack.png', 'img') . "'>", round($row['review_average'])); ?><?php echo str_repeat("<img class='faded-rating' src='" . Asset::get_src('footer-stack.png', 'img') . "'>", 5 - round($row['review_average'])); ?> (<?php echo $row['review_count']; ?> review<?php echo $row['review_count'] == 1 ? '' : 's'; ?>)</p> */ ?>
                            <div class='description'><?php echo $row['short_description']; ?></div>
                        </div>
                    </div>
                <?php echo $i % 2 == 0 ? '</div>' : ''; ?>
                <?php $i++; ?>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>


    <?php echo asset::js('jquery.history.js'); ?>
    <script type="text/javascript">
        $(document).ready(function() {

            $('.form_error').parent().find('input').addClass('error');

            $('.tabs').tabs({
                select: function(event, ui) {
                    jQuery.history.load($(ui.panel).attr('id'));
                }
            });
        });
    </script>
</div><!--/ten columns-->
<?php $this->load->view('buy_with_modal'); ?>