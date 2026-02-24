<div class="modal-form-holder balance-form-container">
    <div id="form_container">
        <div id="modal-header">
            <h3 class="ttl ttl3"><?php echo __('clients:update_balance') ?></h3>
        </div>
        <div class="form-holder">
            <form method="post" action="<?php echo site_url('admin/clients/edit_balance/' . $client_id); ?>">
                <div class="row">
                    <div class="twelve columns">
                        <h5><?php echo __('global:credit_balance') ?></h5>
                        <p class="f-thin-black client-balance no-bottom"><?php echo Currency::format(get_instance()->clients_m->get_balance($client_id)); ?></p>
                    </div>
                </div>
                <div class="row">
                    <div class="six columns">
                        <label for="action"><?php echo __('clients:what_do_you_want_to_do') ?></label>
                        <span class="sel-item"><?php echo form_dropdown('action', $add_remove_options); ?></span>
                    </div>
                    <div class="six columns">
                        <label for="amount"><?php echo __('invoices:amount') ?></label>
                        <?php echo form_input('amount'); ?>
                    </div>
                </div>
                <div class="row">
                    <div class="twelve columns">
                        <a href="#" class="blue-btn js-fake-submit-button">
                            <span><?php echo __("clients:save_balance_alteration"); ?></span>
                        </a>
                    </div>
                </div>
                <input type="submit" class="hidden-submit" />
            </form>
        </div>
    </div> <!-- /form-container -->
</div><!-- /modal-form-holder -->

<?php echo asset::js('jquery.ajaxform.js'); ?>
<script type="text/javascript">

    var is_submitting = false;
    $('#create_form').on('submit', function () {
        if (!is_submitting) {
            is_submitting = true;
        } else {
            return false;
        }
    });

    $('#create_form').ajaxForm({
        dataType: 'json',
        success: showResponse
    });

    function showResponse(data) {

        $('.notification').remove();

        if (typeof (data.error) != 'undefined')
        {
            $('#form_container').before('<div class="notification error">' + data.error + '</div>');
        }
        else
        {
            $('#form_container').html('<div class="notification success">' + data.success + '</div>');
            setTimeout("window.location.reload()", 2000);
        }
    }
</script>