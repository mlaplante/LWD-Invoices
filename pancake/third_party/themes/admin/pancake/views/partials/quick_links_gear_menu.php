<?php
if (!isset($quick_links_owner)) {
    throw new Exception("Cannot load quick links for this page: \$quick_links_owner is not set.");
}

$include_top_level_ul = isset($include_top_level_ul) ? $include_top_level_ul : true;

?>

<?php if ($include_top_level_ul): ?>
    <ul class="invoice-buttons gear-menu">
<?php endif; ?>
    <li class="settings">
        <ul class="settings-dropdown">
            <?php $quick_links = Pancake\Navigation::getQuickLinks($quick_links_owner, isset($data) ? $data : []); ?>
            <?php foreach ($quick_links as $url => $details): ?>
                <?php $url = (!preg_match('!^\w+://! i', $url)) ? site_url($url) : $url; ?>
                <li>
                    <a class="<?php echo $details['class']; ?>" href="<?php echo $url; ?>">
                        <i class="gear-menu-icon <?php echo $details['icon']; ?>"></i>
                        <span><?php echo __($details['title']); ?></span>
                    </a>
                </li>
            <?php endforeach; ?>
        </ul>
    </li>
<?php if ($include_top_level_ul): ?>
    </ul>
<?php endif; ?>