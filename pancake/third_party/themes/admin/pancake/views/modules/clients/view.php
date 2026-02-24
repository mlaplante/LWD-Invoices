<?php $expenses_sum = !isset($expenses_sum) ? 0 : $expenses_sum; ?>
<div id="header">
    <div class="row client-header">
        <h3 class="ttl">
            <?php echo client_name($client); ?>
            <?php if ($show_business_identity): ?>
                <small><?php echo $business_identity_name; ?></small>
            <?php endif; ?>
        </h3>
        <?php echo $template['partials']['search']; ?>

        <div class="client-image">
            <img src="<?php echo get_gravatar($client->email, '200'); ?>" alt="<?php echo $client->first_name . ' ' . $client->last_name; ?> image"/>
        </div><!-- client-image -->
    </div><!-- client-header-->
</div><!-- header-->

<div class="row">
    <div class="client-contact">
    <?php if ($client->phone != '') { ?>
      <span class="contact phone"><?php echo lang('global:phone'); ?>:</span> <span class="contact-text"><?php echo $client->phone; ?></span>
    <?php } if ($client->mobile != '') { ?>
      <span class="contact mobile"><?php echo lang('global:mobile'); ?>:</span> <span class="contact-text"><?php echo $client->mobile; ?></span>
    <?php } if ($client->fax != '') { ?>
      <span class="contact fax"><?php echo lang('global:fax'); ?>:</span> <span class="contact-text"><?php echo $client->fax; ?></span>
    <?php } ?>
        <?php if ($client->url != ''): ?>
            <span><span class="contact-icon fa fa-external-link"></span> <span class="sr-only"><?php echo __('global:website'); ?>:</span> <a class="contact-text" href="<?php echo $client->url; ?>"><?php echo $client->website; ?></a></span>
        <?php endif; ?>

      <span class="contact email"><?php echo lang('global:email'); ?>:</span> <span class="contact-text"><?php echo mailto($client->email); ?></span>
    <br />

    <?php if ($client->address != '') { ?>
      <span class="contact address">Address:</span> <span class="contact-text"><?php if (!empty($client->company)): ?><?php echo $client->company;?>, <?php endif; ?><?php echo nl2br($client->address);?></span>
    <?php } ?>

          <?php foreach ($custom as $field => $details): ?>
              <?php if (trim($details['value']) != ""): ?>
                  <br /><span class="contact-text"><strong><?php echo $details['label']; ?></strong> <?php echo $details['value']; ?></span>
              <?php endif; ?>
          <?php endforeach; ?>
  </div>
</div><!-- /row-->

<div class="row">
  <div id="client-details" class="nine columns content-wrapper">
     <div class="row">
      <div class="tweleve columns">
        <div id="ajax_container"></div><!-- /ajax-->
      </div><!-- /twelve -->
    </div><!-- /row -->

    <?php if ($client->profile != '') { ?>
      <div class="row">
        <div id="notesHolder" class="twelve columns">
      	  <h4><?php echo lang('global:notes'); ?></h4>
       	  <p><?php echo nl2br($client->profile);?></p>
      	</div><!-- /notesHolder -->
      </div><!-- /row -->
    <?php } else { ?>
      <br />
    <?php } ?>


    <!-- Status: Needs tweaking for projects in client area, all styles should carry over and be implmeneted. Projects need filtering to client and then looping
         Last seen: 21st October 2012
    -->

    <?php if ($projects): ?>
		  <?php $this->load->view('projects/_projects_row', array('rows' => $projects['active'], 'status' => 'active')); ?>

		  <?php $this->load->view('projects/_projects_row', array('rows' => $projects['archived'], 'status' => 'archived')); ?>
		      <br />
    <?php endif; ?>



    <?php if ($totals['count'] == 0): ?>

                      <?php if (can('create', $client->id, 'invoices')): ?>
    	<div class="no_object_notification">
    	  <h4><?php echo lang('clients:hasnoinvoicetitle') ?></h4>
    	  <p><?php echo lang('clients:hasnoinvoicebody') ?></p>
    	  <p class="call_to_action"><a class="blue-btn" id="create_invoice" href="<?php echo site_url('admin/invoices/create/client/'.$client->id); ?>"><span><?php echo lang('invoices:create'); ?></span></a></p>
    	</div><!-- /no_object_notification -->
        <?php endif;?>

    <?php else: ?>

        <?php if ($invoices['overdue']): ?>

        <h4 class="ttl ttl4"><?php echo __('invoices:overdue'); ?></h4>
        <div class="twelve columns">
          <div class="table-area thirty-days">
            <?php $this->load->view('reports/table', array('rows' => $invoices['overdue'], 'suffix' => 'overdue')); ?>
          </div>
        </div>

        <?php endif; ?>

        <?php if ($invoices['unpaid']): ?>

          <h4 class="ttl ttl4"><?php echo __('invoices:unpaid'); ?></h4>
          <div class="twelve columns">
            <div class="table-area thirty-days">
              <?php $this->load->view('reports/table', array('rows' => $invoices['unpaid'], 'suffix' => 'unpaid')); ?>
            </div>
          </div>

        <?php endif; ?>

      <?php if ($invoices['paid']): ?>

        <h4 class="ttl ttl2"><?php echo __('invoices:paid'); ?></h4>
        <div class="twelve columns">
     		  <div class="table-area thirty-days">
            <?php $this->load->view('reports/table', array('rows' => $invoices['paid'], 'suffix' => 'paid')); ?>
         </div>
        </div>


      <?php endif; ?>

        <?php if ($invoices['credit_notes']): ?>

        <h4 class="ttl ttl4"><?php echo __('global:credit_notes'); ?></h4>
        <div class="twelve columns">
          <div class="table-area thirty-days">
            <?php $this->load->view('reports/table', array('rows' => $invoices['credit_notes'], 'suffix' => 'credit_note')); ?>
          </div>
        </div>

        <?php endif; ?>

        <?php if ($invoices['estimates']): ?>

        <h4 class="ttl ttl4"><?php echo __('global:estimates'); ?></h4>
        <div class="twelve columns">
          <div class="table-area thirty-days">
            <?php $this->load->view('reports/table', array('rows' => $invoices['estimates'], 'suffix' => 'estimate')); ?>
          </div>
        </div>

        <?php endif; ?>

    <?php endif; ?>

      <?php if ( ! empty($contact_log)): ?>

       <h4 class="ttl ttl2"><?php echo __('contact:title'); ?></h4>
       <div class="twelve columns">
        <div class="table-area">
        	<table class="pc-table">
        		<thead>
        			<tr>
        			    <th><?php echo __('contact:subject') ?></th>
        			    <th><?php echo __('contact:contact') ?></th>
        				<th><?php echo __('global:sent') ?></th>
                                        <th class="contact-actions"><?php echo __('global:actions') ?></th>
        			</tr>
        		</thead>
        		<tbody>
        		<?php foreach ($contact_log as $contact): ?>
        		<tr>
        			<td><?php echo $contact->subject; ?></td>
        			<td><?php echo $contact->method == 'email' ? 'e: '.mailto($contact->contact) : 'p: '.$contact->contact; ?></td>
        	   		<td><?php echo format_date($contact->sent_date, 'h:i:s'); ?></td>
                                <td class="contact-actions"><a href="<?php echo site_url("admin/clients/view_contact/".$contact->id); ?>" class="tiny button" target="_blank"><?php echo __("global:view"); ?></a></td>
        		</tr>
        		<?php endforeach; ?>
        		</tbody>
        	</table>
        </div>
       </div>
      <?php endif; ?>
  </div><!-- /client-details-->

  <div class="three columns side-bar-wrapper">
      <?php $this->load->view("partials/quick_links", [
          "quick_links_owner" => "admin/clients/view",
          "data" => [
              "id" => $client->id,
              "unique_id" => $client->unique_id,
          ]
      ]); ?>
    <div class="panel" style="margin-top: -2em;">
        <div class="row">
            <div class="twelve columns mobile-two">
                <h5><?php echo __('global:credit_balance') ?></h5>
                <p class="f-thin-black client-balance no-bottom" data-symbol="<?php echo Currency::symbol(); ?>"><span class="js-balance-amount"><?php echo Currency::format(get_instance()->clients_m->get_balance($client->id)); ?></span> <a href="<?php echo site_url("admin/clients/edit_balance/".$client->id)?>" class="fire-ajax"><i class="fi fi-pencil"></i></a></p>
            </div>
        </div>
      <div class="row">
        <div class="six columns mobile-two">
          <h5><?php echo lang('global:overdue') ?></h5>
          <p class="f-thin-red no-bottom"><?php echo Currency::format($totals['overdue']); ?></p>
        </div><!-- /six overdue -->

        <div class="six columns mobile-two">
          <h5><?php echo lang('global:unpaid') ?></h5>
          <p class="f-thin-black no-bottom"><?php echo Currency::format($totals['unpaid']); ?></p>
        </div><!-- /six overdue -->
      </div><!-- /row -->

      <div class="row">
        <div class="six columns mobile-two">
          <h5><?php echo lang('global:paid') ?></h5>
          <p class="f-thin-black no-bottom"><?php echo Currency::format($totals['paid']);?></p>
        </div><!-- /six overdue -->

        <div class="six columns mobile-two">
          <h5><?php echo 'Expenses'; ?></h5>
          <p class="f-thin-black no-bottom"><?php echo Currency::format($expenses_sum);?></p>
        </div><!-- /six overdue -->
      </div><!-- /row -->
    </div><!-- /panel -->


	  <div class="panel" id="healthcheck-holder">
      <h4 class="sidebar-title"><?php echo lang('clients:health_check') ?></h4>
      <div class="progress-bar blue">
      	 <span style="width:<?php echo $client->health['overall'];?>%"><?php echo $client->health['overall'];?>%</span>
      </div><!-- /healthCheck -->
    </div><!-- /row -->

    <div class="panel">
        <h4 class="sidebar-title"><?php echo __('kitchen:kitchen_name'); ?></h4>

      	<div id="cas-url-holder">
      		<p class="text"><?php echo __('kitchen:description') ?></p>
      		<p class="urlToSend"><strong><?php echo __('kitchen:urltosend') ?></strong> <br/> <a href="<?php echo site_url(Settings::get('kitchen_route').'/'.$client->unique_id); ?>" class="url-to-send"><?php echo site_url(Settings::get('kitchen_route').'/'.$client->unique_id); ?></a></p>
      		<p><a href="#" id="copy-to-clipboard" class="blue-btn"><span><?php echo __('global:copytoclipboard') ?></span></a></p>

          <?php if($client->passphrase == ''): ?>
            <p class="passphrase no-bottom"><?php echo __('kitchen:nopassphrase') ?></p>
          <?php else: ?>
            <p class="passphrase set no-bottom"><?php echo __('kitchen:passphrase') ?>: <span><?php echo $client->passphrase ?></span></p>
          <?php endif; ?>
      	</div><!-- /cas-url-holder -->
	  </div><!-- /panel -->


  </div><!-- /three -->
</div><!-- /row -->

<script src="<?php echo asset::get_src('jquery.zclip.min.js');?>"></script>
<script>
    $('a#copy-to-clipboard').each(function() {
        var that = $(this);
        that.click(function() {return false;}).zclip({
            path: '<?php echo asset::get_src('ZeroClipboard.swf', 'js')?>',
            copy: $('.url-to-send').text(),
            afterCopy:function(){
                that.find('span').width(that.width()).text('<?php echo __('global:copied');?>');
                setTimeout(function() {
                    that.find('span').text('<?php echo __('global:copytoclipboard') ?>');
                }, 500);
            }
        })
    });
</script>
