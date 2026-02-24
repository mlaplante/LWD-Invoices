<?php $more_threshold = 8; ?>
<?php $i = 1; ?>
<?php foreach ($links as $url => $details): ?>
    <?php if ($i == $more_threshold and $is_base): ?>

        <?php $sub_i = 1; ?>
        <?php $more_has_active = false; ?>
        <?php foreach ($links as $url_buffer => $details_buffer): ?>
            <?php if ($sub_i >= $more_threshold and $details_buffer['container_class'] and preg_match("/\bactive\b/", $details_buffer['container_class'])): ?>
                <?php $more_has_active = true; ?>
            <?php endif;?>
            <?php $sub_i++; ?>
        <?php endforeach; ?>

        <li class="more-link has-dropdown <?php echo $more_has_active ? "active" : ""; ?>">
            <a href="#"><?php echo __("global:more")?></a>
            <ul class="dropdown">
    <?php endif; ?>
    <?php if ($details['type'] == Pancake\Navigation::TYPE_DIVIDER): ?>
        <li class="divider"></li>
    <?php else: ?>
        <li <?php echo build_data_attrs($details['container_data_attributes']); ?> class="<?php if ($is_base): ?><?php if ($i >= $more_threshold): ?>js-more-li<?php else: ?>js-not-more-li<?php endif;?><?php endif; ?> <?php if ($details['type'] == Pancake\Navigation::TYPE_LABEL): ?>pancake-navigation-label-container<?php endif; ?> <?php echo $details['container_class']; ?> <?php echo (count($details['children']) > 0) ? "has-dropdown" : ""; ?> <?php if ($details['badge'] !== null): ?><?php echo ($is_base and $i < $more_threshold) ? "has-top-level-badge": "has-sub-level-badge"; ?><?php endif; ?>">
            <?php if ($details['type'] == Pancake\Navigation::TYPE_LINK): ?>
            <a class="<?php echo $details['class']; ?>" href="<?php echo substr($url, 0, 1) === "#" ? $url : ((!preg_match('!^\w+://! i', $url)) ? site_url($url) : $url); ?>"><?php echo __($details['title']); ?></a>
            <?php elseif ($details['type'] == Pancake\Navigation::TYPE_LABEL): ?>
                <label class="pancake-navigation-label <?php echo $details['class']; ?>"><?php echo __($details['title']); ?></label>
            <?php endif;?>

            <?php if ($details['badge'] !== null): ?>
                <span class="<?php echo ($is_base and $i < $more_threshold) ? "top-level-badge" : "sub-level-badge"; ?>"><?php echo ($is_base and $i < $more_threshold) ? $details['badge'] : $details['badge']; ?></span>
            <?php endif; ?>

            <?php if (count($details['children']) > 0): ?>
                <ul class="dropdown">
                    <?php $this->load->view("partials/navbar", array("links" => $details['children'], "is_base" => false)); ?>
                </ul>
            <?php endif; ?>
        </li>
    <?php endif; ?>
    <?php $i++; ?>
<?php endforeach; ?>
<?php if ($i > $more_threshold and $is_base): ?>
        </ul>
    </li>
<?php endif;?>
