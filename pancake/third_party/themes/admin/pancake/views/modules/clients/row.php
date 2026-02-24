<div class="client-item row">
    <div class="client-info row">
        <div class="ten columns mobile-three">
            <img src="<?php echo get_gravatar($row->email, '50') ?>" class="client-user-pic" />
            <div style="margin-left: 70px;">
                <span class="f-thin-black"><a href="<?php echo site_url('admin/clients/view/' . $row->id); ?>"><?php echo client_name($row); ?></a></span>

            <br />

            <span class="contact address"></span> <span class="contact-text"><a href="<?php echo site_url(Settings::get('kitchen_route') . '/' . $row->unique_id); ?>"><?php echo __("global:client_area"); ?></a></span>

            <?php
            if ($row->phone || $row->mobile) {
                if ($row->phone) {
                    echo '<span class="contact phone">'.__('global:phone').'</span> <span class="contact-text"><a href="#" data-client="' . $row->id . '">' . $row->phone . '</a></span>';
                }
                if ($row->mobile) {
                    echo '<span class="contact mobile">'.__('global:mobile').'</span> <span class="contact-text"><a href="#" data-client="' . $row->id . '">' . $row->mobile . '</a></span>';
                }
                if ($row->phone and $row->mobile) {
                    echo "<br />";
                }
            }
            ?>
            <span class="contact email"><?php echo __('global:email'); ?></span> <span class="contact-text"><?php echo mailto($row->email) ?></span>
                <br />

                <?php foreach (Settings::all_taxes() as $tax_id => $tax): ?>
                    <?php if (isset($all_client_taxes[$row->id][$tax_id])): ?>
                        <span class="contact-text"><strong><?php echo $tax['name']; ?></strong> <?php echo $all_client_taxes[$row->id][$tax_id]; ?></span>
                        <br/>
                    <?php endif; ?>
                <?php endforeach; ?>

            <?php if (isset($custom[$row->id])): ?>
                <?php foreach ($custom[$row->id] as $field => $details): ?>
                <?php if (trim($details['value']) != ""): ?>
                    <span class="contact-text"><strong><?php echo $details['label']; ?></strong> <?php echo $details['value']; ?></span><br />
                <?php endif; ?>
                <?php endforeach; ?>
            <?php endif; ?>
                    </div>
        </div><!-- /ten -->
        <div class="two columns projects mobile-one">
            <?php echo __("global:projects"); ?> <br />
            <span class="project-count"><?php echo $row->project_count; ?></span>
        </div><!-- /two -->
    </div><!-- /client-info-->

    <div class="client-extra row">
        <div class="three columns mobile-one"><strong><?php echo __('global:unpaid'); ?>:</strong> <?php echo Currency::format($row->unpaid_total); ?></div>
        <div class="three columns mobile-one"><strong><?php echo __('global:paid'); ?></strong> <?php echo Currency::format($row->paid_total); ?></div>
        <div class="three columns mobile-one">
            <div class="healthCheck">
                <span class="healthBar"><span class="paid" style="width:<?php echo $row->health['overall']; ?>%"></span></span>
            </div><!-- /healthCheck -->
        </div><!-- /three -->
        <div class="three columns align-right mobile-one">
            <?php $this->load->view("partials/quick_links_gear_menu", [
                "quick_links_owner" => "admin/clients/view",
                "data" => [
                    "id" => $row->id,
                    "unique_id" => $row->unique_id,
                ],
            ]); ?>
        </div><!-- /three-->
    </div><!-- /client-exra-->
</div><!-- /client-item -->