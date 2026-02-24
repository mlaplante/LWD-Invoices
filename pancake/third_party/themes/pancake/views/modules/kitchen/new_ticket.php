<div id="content">
    <h1><?php echo $client->first_name; ?> <?php echo $client->last_name; ?><br><?php echo __('tickets:support_tickets'); ?></h1>
    <div id="ticket-body" class="eight columns new-ticket-from">
        <div id="ticket-create" >

            <div class="help">
                <h3><?php echo __("tickets:submit_new"); ?></h3>
            </div> <br />

            <?php echo form_open_multipart(Settings::get('kitchen_route') . '/' . $client->unique_id . '/new_ticket/', array('class' => 'form-holder row')) ?>
            <div class="twelve columns">
                <label for="subject" style="width:20%;"><?php echo __('tickets:ticket_subject'); ?></label>
                <input type="text" id="subject" name="subject" style="padding:6px;border-radius:5px;border:1px solid #ccc;width:53%;margin-left:30px;margin-bottom:10px;">
            </div>

            <div class="twelve columns" style="margin-bottom:10px;">
                <label for="message" style="display:inline-block;vertical-align:top;"><?php echo __('tickets:ticket_message'); ?></label>
                <div class="textarea ticket" style="display:inline-block;width:54%;margin-left:23px;">
                    <?php
                    echo form_textarea(array(
                        'name' => 'message',
                        'id' => 'message',
                        'style' => 'display:inline-block;width:100%;',
                        'value' => '',
                        'rows' => 10,
                        'cols' => 55
                    ));
                    ?>
                </div>
            </div>

            <div class="six columns" style='margin-bottom: 10px;'>
                <label for='ticketfile' style="width: 13.5%;display: inline-block;">Attach a file:</label> <input type="file" id="ticketfile" name="ticketfile">
            </div>

            <div class="six columns" style="margin-bottom:10px;">
                <label for="priority" style="width:13.5%;display: inline-block;"><?php echo __('tickets:ticket_priority'); ?></label>
                <span class="sel-item">
                    <?php echo form_dropdown('priority_id', $priorities, 0, 'style="width:54%;" class="sel_priority"'); ?>
                </span>
            </div>

            <div class="six columns end" style="margin-bottom:10px;">
                <label for="status" style="width:13.5%;display: inline-block;"><?php echo __('tickets:ticket_status'); ?></label>
                <span class="sel-item">
                    <?php echo form_dropdown('status_id', $statuses, ($statuses[2] === "Open" ? 2 : 0), 'style="width:54%;"'); ?>
                </span>
            </div>
            <input type="hidden" name="is_billable" class="ticket_is_billable" value="0" />
            <input type="hidden" name="ticket_amount" class="ticket_amt" value="0" />
            <div class="twelve columns">
                <input type="submit" id="submit" class="button" value="<?php echo __("global:save"); ?>">
                <a href="<?php echo site_url(Settings::get('kitchen_route') . '/' . $client->unique_id . '/tickets/'); ?>" class="button"><?php echo __("global:cancel")?></a>
            </div>
            </form>
        </div>
    </div>
</div>
<script>
    $('textarea').redactor(redactor_options);
</script>