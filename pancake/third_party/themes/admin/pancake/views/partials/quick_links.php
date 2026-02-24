<?php
if (!isset($quick_links_owner)) {
    throw new Exception("Cannot load quick links for this page: \$quick_links_owner is not set.");
}
?>
<div class="panel">
    <h4 class="sidebar-title"><?php echo __('global:quick_links'); ?></h4>
    <ul class="side-bar-btns">
        <?php $quick_links = Pancake\Navigation::getQuickLinks($quick_links_owner, isset($data) ? $data : []); ?>
        <?php foreach ($quick_links as $url => $details): ?>
            <?php $url = (!preg_match('!^\w+://! i', $url)) ? site_url($url) : $url; ?>
            <li>
                <i class="quicklink-icon <?php echo $details['icon']; ?>"></i>
                <a class="not-has-before <?php echo $details['class']; ?>" href="<?php echo $url; ?>">
                    <span><?php echo __($details['title']); ?></span>
                </a>
            </li>
        <?php endforeach; ?>
    </ul>
</div>