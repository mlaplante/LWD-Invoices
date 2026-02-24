<div id="modal-header">
    <div class="row">
        <h3 class="ttl ttl3">Payment Details</h3>
    </div>
</div>

<div id="<?php echo $is_add_payment ? 'add_payment' : 'partial-payment-details' ?>">
    <form method="post" action="<?php echo $submit_url; ?>" class="form-holder js-payment-details-form row <?php echo $is_add_payment ? '' : 'partial-payment-details'; ?>">
        <div class="row">
          <div class="twelve columns">
            <label><?php echo __('partial:paymentmethod');?></label>
            <span class="sel-item"><?php echo form_dropdown('payment-gateway', $gateways, $gateway, 'class=""'); ?></span>
          </div>
        </div>
        
      <div class="row">
        <?php if (!$is_add_payment): ?>
          <div class="six columns">
            <label><?php echo __('partial:paymentstatus');?></label>
            <span class="sel-item"><?php echo form_dropdown('payment-status', array('Completed' => __('gateways:completed'), 'Pending' => __('gateways:pending'), 'Refunded' => __('gateways:refunded'), '' => __('gateways:unpaid')), $status === '0' ? '' : $status, 'class=""'); ?></span>
          </div>
        <?php else: ?>
          <div class="six columns">
            <label><?php echo __('invoices:amount');?></label>
            <input type="text" class="text txt" name="payment-amount" value="">
          </div>
        <?php endif;?>
      
        <div class="six columns">
          <label><?php echo __('partial:paymentdate');?></label>
          <input type="text" class="text txt datePicker" name="payment-date" value="<?php echo $date;?>">
        </div>
      </div><!-- /row-->
	    
	    <div class="row">
        <div class="six columns">
          <label><?php echo __('partial:transactionfee');?></label>
          <div class="row">
              <div class="two columns">
                  <label for="fee" class="fee-label"><?php echo $currency;?></label>
              </div>
              <div class="ten columns">
                  <input type="text" class="text txt" id="fee" name="transaction-fee" value="<?php echo $fee;?>">
              </div>
          </div>
         
         
        </div>

        <div class="six columns">
          <label><?php echo __('partial:transactionid');?></label>
          <input type="text" name="payment-tid" class="text txt" value="<?php echo $tid;?>">
        </div>
      </div><!-- /row -->
        
      <div class="row">
          <div class="twelve columns">
            <input type="checkbox" name="send_payment_notification" value="1"> <?php echo __("invoices:send_payment_notification"); ?>
        </div>
      </div>
      
      <div class="row">
        <div class="twelve columns">
          <label></label>
          <button type="submit" class="blue-btn <?php echo $is_add_payment ? 'add_payment_button' : 'savepaymentdetails'?>"><span><?php echo __('partial:'.($is_add_payment ? 'add_payment' : 'savepaymentdetails'));?></span></button>
        </div>  
      </div>

    </form>
</div>

<script>
  $(".datePicker").datepicker( "getDate");
</script>