<div class="modal-form-holder">
    <div id="form_container">
        <div id="modal-header">
            <div class="row">
                <h3 class="ttl ttl3"><?php echo __('expenses:sort_or_filter'); ?></h3>
            </div>
        </div>
        <div class="form-holder">
            <form method="get" action="<?php echo site_url("admin/expenses/sort"); ?>">

                <div class="row">
                    <div class="six columns">
                        <div class="row">
                            <div class="twelve columns">
                                <label for="start_time"><?php echo __('global:sort_by'); ?></label>
                                <span class="sel-item">
                                    <?php
                                    echo form_dropdown('sort_by', array(
                                        "name" => __('global:name'),
                                        "amount" => __('expenses:amount'),
                                        "category" => __('expenses:category'),
                                        "supplier" => __('expenses:supplier'),
                                        "due_date" => __('projects:due_date'),
                                            ), $sort_by, 'id="sort_by" class="txt"');
                                    ?>
                                </span>
                            </div>
                        </div>
                        <div class="row">
                            <div class="twelve columns">
                                <label for="sort_order"><?php echo __('global:sort_order'); ?></label>
                                <span class="sel-item">
                                    <?php echo form_dropdown('sort_order', array("asc" => __("global:asc"), "desc" => __("global:desc")), $sort_order, 'id="sort_order" class="txt"'); ?>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="six columns">
                        <div class="row">
                            <div class="twelve columns">
                                <label for="start_date"><?php echo __('expenses:start_date'); ?></label>
                                <?php echo form_input('start_date', '', 'id="start_date" class="txt datePicker"'); ?>
                            </div>
                        </div>
                        <div class="row">
                            <div class="twelve columns">
                                <label for="end_date"><?php echo __('expenses:end_date'); ?></label>
                                <?php echo form_input('end_date', '', 'id="end_date" class="txt datePicker"'); ?>
                            </div>
                        </div>
                    </div>
                </div>




                <div class="row">
                    <div class="six columns">
                        <h4>Choose Suppliers</h4>
                        <?php foreach ($suppliers as $supplier): ?>
                            <?php echo form_checkbox('suppliers[]', $supplier->id, TRUE); ?> <?php echo $supplier->name ?> <br />
                        <?php endforeach ?>
                    </div>
                    <div class="six columns">
                        <h4>Choose Categories</h4>
                        <?php foreach ($categories as $category): ?>
                            <div><?php echo form_checkbox('categories[]', $category->id, TRUE); ?> <?php echo $category->name ?></div>
                            <?php foreach ($category->categories as $subcat): ?>
                                <div style='margin-left: 16px;'><?php echo form_checkbox('categories[]', $subcat->id, TRUE); ?> <?php echo $subcat->name ?></div>
                            <?php endforeach ?>
                        <?php endforeach ?>
                        </span>
                    </div>
                </div>
                <div class="row">
                    <a href="#" class="blue-btn js-submit-form"><span><?php echo __("expenses:show"); ?></span></a>
                </div>
                <input type="submit" class="hidden-submit" />
            </form>
        </div>
    </div>
</div>
<script>
    $("#start_date").datepicker("getDate");
    $("#end_date").datepicker("getDate");

    $('#sort_by').val($_GET['sort_by']);
    $('#sort_order').val($_GET['sort_order']);
    $('#start_date').val($_GET['formatted_start_date']);
    $('#end_date').val($_GET['formatted_end_date']);

    var selected_suppliers = [];
    var selected_categories = [];

    var unselect_selector = [];
    if (typeof ($_GET['suppliers']) !== 'undefined') {
        $.each($_GET['suppliers'], function(key, value) {
            unselect_selector.push(':not([name="suppliers[]"][value="' + value + '"])');
        });
    }

    if (typeof ($_GET['categories']) !== 'undefined') {
        $.each($_GET['categories'], function(key, value) {
            unselect_selector.push(':not([name="categories[]"][value="' + value + '"])');
        });
    }
    
    unselect_selector = unselect_selector.join("");
    
    $('[name="categories[]"]'+unselect_selector+', [name="suppliers[]"]'+unselect_selector).prop('checked', false);
</script>