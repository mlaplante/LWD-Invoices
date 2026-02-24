<?php
/*
 * View Time Sheet Entries Page
 * Version 2 (Created: 06th January 2013)
 */
?>

<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo __('tickets:all_tickets') ?></h2>
        <?php echo $template['partials']['search']; ?>
    </div>
</div>

<?php $this->load->view('sort'); ?>

<div class="row mailpane">
    <div id="ticket-feed" class="four columns">
        <ul>
            <li class="ticket-item add">
                <!-- <a href="#"> -->
                <div class="image"></div>
                <div class="body">
                    <h4 style="color: #777; margin-bottom: 12px; margin-top: 10px; font-size: 14px; font-style: italic;"><?php echo anchor('admin/tickets/create', __('tickets:add_a_new_ticket') . ' &rarr;') ?></h4>
                </div>
                <!-- </a> -->
                <br class="clear" />
            </li>
            <?php $this->load->view('tickets/ticket_list') ?>
        </ul>
    </div>

    <div id="ticket-body" class="eight columns">

        <div id="ticket-actions">
            <div class="row">
                <div class="seven columns"><strong><?php echo $current_ticket->subject ?></strong> - <strong><?php echo client_name($current_ticket->client_id); ?></strong></div>
                <div class="five columns align-right">
                    <strong>
                        <?php echo __('tickets:ticket_number', array($current_ticket->id)); ?>
                        <?php if ($this->client_support_rates_matrix_m->is_billable($current_ticket->priority_id, $current_ticket->client_id)) : ?>
                            (<span class="ticket-<?php echo $current_ticket->is_paid ? "" : "un"; ?>paid"><?php echo Currency::format($current_ticket->amount); ?></span>)<br />
                            <?php echo $current_ticket->invoice_id ? anchor(get_instance()->invoice_m->getUniqueIdById($current_ticket->invoice_id), __("invoices:invoicenumber", array($current_ticket->invoice['invoice_number']))) : __('tickets:not_yet_generated'); ?>
                        <?php endif; ?>
                    </strong>
                    <span class="tag" style="margin-left: 1em; color: <?php echo $current_ticket->status->font_color; ?>; background: <?php echo $current_ticket->status->background_color; ?>; -webkit-box-shadow: <?php echo $current_ticket->status->box_shadow; ?>; -moz-box-shadow: <?php echo $current_ticket->status->box_shadow; ?>; box-shadow: <?php echo $current_ticket->status->box_shadow; ?>;" ><?php echo $current_ticket->status->title; ?></span>
                    <!-- <i class="g16 settings">&nbsp;</i> -->
                </div>
            </div>
        </div>

        <div id="ticket-content">
            <?php if ($this->client_support_rates_matrix_m->is_billable($current_ticket->priority_id, $current_ticket->client_id) and ! $current_ticket->invoice_id) : ?>
                <p style="text-align: center;"><?php echo __('tickets:invoice_will_be_generated', array(Currency::format($current_ticket->amount), $statuses[Settings::get("ticket_status_for_sending_invoice")])); ?></p>
            <?php endif; ?>
            <?php
            $prev_date = '';
            foreach ($current_ticket->activity as $ts => $activity):
                ?>

                <?php
                $date = format_date($ts);
                if ($prev_date != $date):
                    $prev_date = $date;
                    ?>
                    <div class="date-divider"><span><?php echo $date ?></span></div>
                <?php endif ?>

                <?php
                if (isset($activity['post']) && $activity['post']):
                    $is_staff = $activity['post']->user_id != null;
                    ?>
                    <div class="message <?php echo $is_staff ? 'staff' : '' ?>">
                        <img class="ticket-user" src="<?php echo get_gravatar($is_staff ? $activity['post']->user->email : $current_ticket->client_email, 60); ?>" />
                        <div class="text">
                            <h6><?php echo $activity['post']->user_name ?></h6>
                            <p><?php echo nl2br($activity['post']->message) ?></p>
                        </div>
                        <br class="clear" />
                    </div>
                    <?php if (!empty($activity['post']->orig_filename)): ?>
                        <div class="files">
                            <p><?php echo __('tickets:attachment') ?>:</p>
                            <?php
                            $ext = explode('.', $activity['post']->orig_filename);
                            end($ext);
                            $ext = current($ext);
                            ?>
                            <?php if ($ext == 'png' OR $ext == 'jpg' OR $ext == 'gif'): ?>
                                <div class="image-preview">
                                    <p><img src="<?php echo site_url(Settings::get('kitchen_route') . '/' . $current_ticket->client_unique_id . '/download_ticket_file/' . $activity['post']->real_filename); ?>" style="max-width:50%" /></p>
                                </div>
                            <?php endif; ?>
                            <?php $bg = asset::get_src('file-types/' . $ext . '.png', 'img'); ?>
                            <?php $style = empty($bg) ? '' : 'style="background: url(' . $bg . ') 1px 0px no-repeat;"'; ?>
                            <a class="file-to-download" <?php echo $style; ?> href="<?php echo site_url(Settings::get('kitchen_route') . '/' . $current_ticket->client_unique_id . '/download_ticket_file/' . $activity['post']->real_filename); ?>"><?php echo $activity['post']->orig_filename; ?></a>
                        </div>
                    <?php endif; ?>

                <?php endif ?>

                <?php if (isset($activity['history']) && $activity['history']): ?>
                    <div class="notice" style="border-bottom: 1px solid <?php echo $activity['history']->status->background_color ?>;">
                        <span style="background: <?php echo $activity['history']->status->background_color ?>; color: <?php echo $activity['history']->status->font_color ?>;">
                            <?php echo __("tickets:user_updated_ticket", array($activity['history']->user_name, '<strong>'.$activity['history']->status->title.'</strong>', format_date($ts, true))); ?>
                        </span>
                    </div>
                <?php endif ?>
            <?php endforeach ?>


        </div>

        <div id="ticket-reply" class="form-holder">
            <?php echo form_open_multipart('admin/tickets/reply/' . $current_ticket->id) ?>
            <label for="ticketreply"><?php echo __('tickets:respond'); ?></label>
            <textarea id="ticketreply" name="message" class="ticket_comment"></textarea>
            <div class="row no-bottom">
                <div class="eight columns">
                    <?php echo __('global:attach_file', array(get_max_upload_size())); ?>: <input type="file" id="ticketfile" name="ticketfile">
                </div>
                <div class="four columns align-right">
                    <a class="ticket-options" href="javascript:void(0)"><?php echo __('tickets:ticket_options') ?> <span>&darr;</span></a>
                    <button class="blue-btn" style="font-size: 13px;"><?php echo __("global:reply"); ?></button>
                </div>
            </div>
            </form>

            <?php echo form_open('admin/tickets/edit/' . $current_ticket->id, array('class' => 'edit-ticket')) ?>
            <div class="row no-bottom">
                <div class="five columns">
                    <span class="sel-item">
                        <?php echo form_dropdown('assigned_user_id', $users_select, set_value('assigned_user_id', $current_ticket->assigned_user_id), 'class="txt"'); ?>
                    </span>
                </div>
                <div class="five columns">
                    <span class="sel-item">
                        <?php echo form_dropdown('status_id', $statuses, set_value('status_id', $current_ticket->status_id)); ?>
                    </span>
                </div>
                <div class="two columns">
                    <?php if (!$current_ticket->is_archived): ?>
                        <a href="<?php echo site_url('admin/tickets/archive/' . $current_ticket->id); ?>" class="archive-ticket-button"><?php echo __("tickets:archive"); ?></a>
                    <?php else: ?>
                        <a href="<?php echo site_url('admin/tickets/unarchive/' . $current_ticket->id); ?>" class="unarchive-ticket-button"><?php echo __("tickets:unarchive"); ?></a>
                    <?php endif; ?>
                    <button class="blue-btn" style="font-size: 13px;"><?php echo __('global:save'); ?></button>
                </div>
            </div>
            </form>
        </div>

    </div>
</div>

<script>
    $("#ticket-content").scrollTop($("#ticket-content")[0].scrollHeight);
    $(".ticket-options").click(function() {
        $(".edit-ticket").toggle(300);
    });
</script>
