<div class="modal-form-holder">

    <div id="modal-header">
        <div class="row">
            <h3 class="ttl ttl3"><?php echo lang('projects.' . $action . '.title'); ?></h3>
        </div>
    </div>

    <div class="row">

        <div id="form_container">
            <div class="form-holder">

                <?php echo form_open('admin/projects/' . $action, array('id' => 'create_form', 'class' => 'js-projects-form')); ?>

                <div class="row">
                    <label for="name"><?php echo lang('projects.label.name'); ?></label>
                    <?php echo form_input('name', set_value('name', isset($project) ? $project->name : ''), 'class="txt" id="name"'); ?>

                    <div class="row add-bottom">
                        <?php if ($this->assignments->can_see_project_rates(isset($project) ? $project->id : null)): ?>
                            <div class="six columns">
                                <label for="currency"><?php echo __('settings:currency'); ?></label>
                                <?php if ($action == 'create'): ?>
                                    <span class="sel-item">
                                    <?php echo form_dropdown('currency', $currencies, set_value('currency', isset($project) ? $project->currency_code : ''), 'id="currency"'); ?>
                                </span>
                                <?php else: ?>
                                    <?php echo $project->currency_code ? $project->currency_code : Currency::code(); ?>
                                <?php endif; ?>

                            </div><!-- /6-->
                        <?php endif; ?>
                        <div class="six columns">
                            <label for="client_id"><?php echo lang('projects.label.client'); ?></label>
                            <span class="sel-item"><?php echo form_dropdown('client_id', $clients_dropdown, set_value('client_id', isset($project) ? $project->client_id : 0), 'id="client_id"'); ?></span>
                        </div>
                    </div>

                    <?php if ($this->assignments->can_see_project_rates(isset($project) ? $project->id : null)): ?>
                        <div class="row add-bottom">
                            <div class="six columns">
                                <label for="is_flat_rate"><?php echo __('projects:rate_type'); ?></label>
                                <span class="sel-item"><?php echo form_dropdown('is_flat_rate', array(0 => __("projects:hourly_rate"), 1 => __("items:select_flat_rate")), set_value('is_flat_rate', isset($project) ? $project->is_flat_rate : 0), 'id="is_flat_rate"'); ?></span>
                            </div>
                            <div class="six columns">
                                <label for="rate"><?php echo __('invoices:ratewithcurrency', array(Currency::symbol())); ?></label>
                                <?php echo form_input('rate', set_value('rate', isset($project) ? $project->rate : '0.00'), 'id="rate" class="txt"'); ?>
                            </div>
                        </div>
                    <?php endif; ?>

                    <div class="row add-bottom">
                        <div class="six columns">
                            <label for="projected_hours"><?php echo __('projects:projected_hours'); ?></label>
                            <?php echo form_input('projected_hours', set_value('projected_hours', isset($project) ? $project->projected_hours : '0'), 'id="projected_hours" class="txt"'); ?>
                        </div><!-- /6 -->

                        <div class="six columns">
                            <label for="due_date"><?php echo lang('projects.label.due_date'); ?></label>
                            <?php $due_date = set_value('due_date', isset($project) ? $project->due_date : time()); ?>
                            <?php echo form_input('due_date', $due_date ? format_date($due_date) : "", 'id="due_date" class="datePicker txt"'); ?>
                        </div>
                    </div>

                    <label for="description"><?php echo lang('projects.label.description'); ?></label>
                    <?php
                    echo form_textarea(array(
                        'name' => 'description',
                        'id' => 'description',
                        'value' => set_value('description', isset($project) ? $project->description : ''),
                        'rows' => 4,
                        'cols' => 50,
                    ));
                    ?>

                    <div class="row">
                        <label class="twelve columns">
                            <?php
                            echo form_checkbox(array(
                                'name' => 'is_viewable',
                                'value' => 1,
                                'checked' => (isset($project) ? ($project->is_viewable == 1) : true),
                            ));
                            ?>
                            <?php echo lang('projects.label.is_viewable'); ?>
                        </label>
                    </div>

                    <div class="row">
                        <label class="twelve columns">
                            <?php
                            echo form_checkbox(array(
                                'name' => 'is_timesheet_viewable',
                                'value' => 1,
                                'checked' => (isset($project) ? ($project->is_timesheet_viewable == 1) : true),
                            ));
                            ?>
                            <?php echo __('projects:is_timesheet_viewable'); ?>
                        </label>
                    </div>

                    <br/>

                    <div class="row">
                        <div class="twelve columns">
                            <div class="twelve columns">
                                <?php assignments('projects', (isset($project) ? $project->id : 0)); ?>
                            </div>
                        </div>
                    </div>

                    <br/>

                    <?php if (isset($project)): ?>
                        <input type="hidden" name="id" value="<?php echo $project->id; ?>"/>
                    <?php endif; ?>
                </div>

                <a href="#" class="blue-btn js-fake-submit-button"><span><?php echo lang('projects.button.' . $action); ?></span></a>
            </div>

            </form>
        </div>
    </div>
</div><!-- /modal-form-holder -->

<?php echo asset::js('jquery.ajaxform.js'); ?>
<script type="text/javascript">
    $('#create_form').ajaxForm({
        dataType: 'json',
        success: showResponse
    });

    function showResponse(data) {
        $('.notification').remove();

        if (typeof (data.error) != 'undefined') {
            $('#form_container').before('<div class="notification error">' + data.error + '</div>');
            return false;
        } else {
            $('#form_container').before('<div class="notification success">' + data.success + '</div>');
            setTimeout(function () {
                window.location.reload();
            }, 100);
        }
    }
</script>
