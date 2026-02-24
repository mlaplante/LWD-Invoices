<div class="modal-form-holder">
    <div id="form_container">
        <div id="modal-header">
            <div class="row">
                <h3 class="ttl ttl3"><?php echo __('expenses:' . ($action == "create" ? "add" : "edit_expense")); ?></h3>
            </div>
        </div>
        <div class="form-holder">
            <?php echo form_open_multipart((isset($submit_url) ? $submit_url : 'admin/expenses/' . $action), 'id="expense-mod"'); ?>
            <div class="row">
                <div class="four columns">
                    <label for="name"><?php echo __("expenses:name"); ?></label>
                </div>
                <div class="eight columns end">
                    <?php echo form_input('name', set_value('name'), 'id="name" class="txt"'); ?>
                </div>
            </div>
            <div class="row">
                <div class="four columns">
                    <label for="rate"><?php echo __('invoices:amount'); ?></label>
                </div>
                <div class="eight columns end">
                    <?php echo form_input('rate', set_value('rate'), 'id="rate" class="txt"'); ?>
                </div>
            </div>
            <div class="row">
                <div class="four columns">
                    <label for="rate"><?php echo __('expenses:category'); ?></label>
                </div>
                <div class="eight columns end">
                    <div class="sel-item">
                        <select name="category_id">
                            <option value=""><?php echo __('global:select'); ?></option>
                            <?php foreach ($categories as $category): ?>
                                <?php if (!empty($category->categories)): ?>
                                    <optgroup label="<?php echo $category->name; ?>">
                                        <?php foreach ($category->categories as $subcat): ?>
                                            <option value="<?php echo $subcat->id; ?>" <?php echo set_select('category_id', $subcat->id, (isset($expense) ? $subcat->id == $expense->category_id : false)); ?>><?php echo $subcat->name; ?></option>
                                        <?php endforeach; ?>
                                    </optgroup>
                                <?php else: ?>
                                    <option value="<?php echo $category->id; ?>" <?php echo set_select('category_id', $category->id, (isset($expense) ? $category->id == $expense->category_id : false)); ?>><?php echo $category->name; ?></option>
                                <?php
                                endif;
                            endforeach;
                            ?>
                        </select>
                    </div>
                </div>

            </div>

            <div class="row">

                <div class="four columns">
                    <label for="rate"><?php echo __('expenses:supplier'); ?></label>
                </div>

                <div class="eight columns end">
                    <div class="sel-item">
                        <select name="supplier_id">
                            <option value=""><?php echo __('global:select'); ?></option>
                            <?php foreach ($suppliers as $supplier): ?>
                                <option value="<?php echo $supplier->id ?>" <?php echo set_select('supplier_id', $supplier->id, isset($expense) ? $supplier->id == $expense->supplier_id : false) ?>><?php echo $supplier->name ?></option>
                            <?php endforeach ?>
                        </select>
                    </div>
                </div>

            </div>

            <?php if (!isset($project_id)): ?>
                <div class="row">

                    <div class="four columns">
                        <label for="rate"><?php echo __('global:project'); ?></label>
                    </div>

                    <div class="eight columns end">
                        <div class="sel-item">
                            <select name="project_id">
                                <option value=""><?php echo __('expenses:no_project_business_expense'); ?></option>
                                <?php foreach ($projects as $project): ?>
                                    <option value="<?php echo $project->id ?>" <?php echo set_select('project_id', $project->id, isset($expense) ? $project->id == $expense->project_id : false) ?>><?php echo $project->name ?></option>
                                <?php endforeach ?>
                            </select>
                        </div>
                    </div>

                </div>
            <?php else: ?>
                <input type="hidden" name="project_id" value="<?php echo $project_id; ?>" />
            <?php endif; ?>

            <div class="row">

                <div class="four columns">
                    <label for="due_date2"><?php echo __('expenses:expense_date'); ?></label>
                </div>

                <div class="eight columns end">
                    <?php echo form_input('due_date', set_value('due_date'), 'id="due_date2" class="datePicker txt"'); ?>
                </div>

            </div>

            <div class="row">
                <div class="four columns">
                    <label for="description"><?php echo __('global:description') ?></label>
                </div>

                <div class="eight end columns">
                    <?php
                    echo form_textarea(array(
                        'name' => 'description',
                        'id' => 'description',
                        'value' => set_value('description'),
                        'rows' => 50,
                        'cols' => 30
                    ));
                    ?>
                </div>
            </div>

                <div class="row">
                    <div class="twelve columns">
                        <label for="receipt"><?php echo __("expenses:attach_receipt", array(get_max_upload_size())); ?></label>
                        <input type="file" name="receipt" id="receipt" />
                    </div>
                </div>

            <div class="twelve columns">
                <?php assignments('project_expenses', str_ireplace(['edit/', 'create'], '', $action)); ?>
            </div>




            <div class="row">
                <div class="eight columns">

                </div><!-- /eight columns -->
                <div class="four columns">
                    <p><a href="#" class="blue-btn js-fake-submit-button"><span><?php echo __('expenses:' . ($action == "create" ? "add" : "edit_expense")); ?></span></a></p>
                </div><!-- /four columns -->

            </div>



            <input type="submit" class="hidden-submit" />

            <?php echo form_close(); ?>
        </div><!-- /form holder-->


    </div> <!-- /form-container -->
</div><!-- /modal-form-holder -->