<div id="header">
    <div class="row content-area">
        <h2 class="ttl ttl3"><?php echo __("dashboard:team_activity") ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>
<div id="dashboard-main">
    <div class="row  content-wrapper">
        <div class="twelve columns">
            <?php $this->load->view("_team_activity"); ?>
        </div>
    </div>
</div>
