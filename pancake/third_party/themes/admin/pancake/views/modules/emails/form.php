<div id="header">
    <div class="row">
        <h2 class="ttl ttl3"><?php echo lang('emailtemplates:' . $action_type); ?></h2>
		<?php echo $template['partials']['search']; ?>
    </div>
</div>

<div class="row">
    <div class="nine columns connine endt-wrapper content-wrapper">
        <div id="ajax_container"></div>

        <div class="form-holder" style="margin-top:2em">
            <?php echo form_open('admin/emails/' . $action, 'id="email-mod"'); ?>
            <fieldset class="add_client">

                <div id="invoice-type-block">


                     <div class="row">

	                    <div class="two columns">
                             <label for="title"><?php echo lang('emailtemplates:name') ?></label>
                        </div>

                        <div class="five columns">
                            <?php echo form_input('name', set_value('name'), 'id="name" class="txt"'); ?>
                        </div>

                        <div class="one columns"></div>

                        <div class="two columns">
                            <label for="days"><?php echo lang('emailtemplates:days') ?></label>
                        </div>

                        <div class="one columns">
                            <?php echo form_input('days', set_value('days'), 'id="days" class="txt"'); ?>
                        </div>

                        <div class="one columns"></div>


                    </div>

                    <div class="row">
                        <div class="two columns">
                            <label for="subject"><?php echo lang('emailtemplates:subject') ?></label>
                        </div>

                        <div class="nine columns end">
                            <?php echo form_input('subject', set_value('subject'), 'id="subject" class="txt"'); ?>
                        </div>
                    </div>

                    <div class="row">
                        <div class="two columns">
                            <label for="address"><?php echo lang('emailtemplates:content') ?></label>
                        </div>

                        <div class="nine end columns">
                            <?php
                            echo form_textarea(array(
                                'name' => 'content',
                                'id' => 'content',
                                'value' => set_value('content'),
                                'rows' => 50,
                                'cols' => 30
                            ));
                            ?>
                        </div>
                    </div>

                    <div class="row">
                        <div class="two columns">
                            <label for="type"><?php echo lang('emailtemplates:type') ?></label>
                        </div>

                        <div class="four end columns">
                            <div class="sel-item dropdown-arrow">
                                <select name="type" id="type">
                                    <option id="invoice" value="invoice">Invoice</option>
                                </select>
                            </div>
                        </div>
                    </div>




                    <div class="row">
							<div class="eight columns">

							</div><!-- /eight columns -->
							<div class="four columns">
								<a href="#" class="blue-btn js-fake-submit-button"><span><?php echo lang('emailtemplates:' . $action_type); ?>&rarr;</span></a>
							</div><!-- /four columns -->

                        </div>

                </div><!-- /row -->

            </fieldset>

            <input type="submit" class="hidden-submit" />

<?php echo form_close(); ?>
        </div><!-- /form holder-->
    </div><!-- /9 cols -->

    <div class="three columns side-bar-wrapper">
            <?php $this->load->view("partials/quick_links", array("quick_links_owner" => "admin/emails")); ?>
    </div>
</div><!-- /row -->