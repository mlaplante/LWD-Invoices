<?php $CI = get_instance(); ?>
<?php $humanized = humanize($item_type == 'project_expenses' ? 'expenses' : $item_type); ?>
<div class="row user_assignments item_type_<?php echo $item_type;?>">
    <div class="<?php echo $label_columns; ?> columns">
        <label>Permissions</label>
        <input type="hidden" name="pancake_assignment_data[item_type]" class="user_permissions_item_type" value="<?php echo $item_type ?>">
        <input type="hidden" name="pancake_assignment_data[item_id]" value="<?php echo (int) $item_id ?>">
    </div>
    <div class="nine end columns assigned_users_list">
        <?php if ($item_type == 'clients'): ?>
            <p>Select the users who can access information related to this <?php echo strtolower(singular($humanized)); ?>.<br /><strong>Administrators can override these permissions when creating or editing any item listed below.</strong></p>
        <?php else: ?>
            <p>Select the access you want your users to have to this <?php echo strtolower(singular($humanized)); ?>.</p>
        <?php endif; ?>
        <?php foreach ($users as $user_id => $full_name): ?>
            <div class='assigned_user'>
                <div class='parent-module'>
                    <label>
                        <span class='assigned_user_username'><?php echo $full_name ?></span>
                        <div class='select user_permission_levels'>
                            <div class="sel-item dropdown-arrow">
                                <input class="value" value='<?php echo (isset($existing_permission_levels[$user_id]) ? (empty($existing_permission_levels[$user_id]) ? '00000' : $existing_permission_levels[$user_id]) : '00000'); ?>' type="hidden" name="pancake_assignment_data[permission_levels][<?php echo $user_id; ?>]">
                                <select class="permission_level">
                                    <option value="000" <?php echo (isset($existing_permission_levels[$user_id]) and substr($existing_permission_levels[$user_id], 0, 3) === "000") ? 'selected="selected"' : ''; ?>>No access to this <?php echo strtolower(singular(humanize($humanized))) ?></option>
                                    <option value="100" <?php echo (isset($existing_permission_levels[$user_id]) and substr($existing_permission_levels[$user_id], 0, 3) === "100") ? 'selected="selected"' : ''; ?>>Can only view this <?php echo strtolower(singular(humanize($humanized))) ?></option>
                                    <option value="110" <?php echo (isset($existing_permission_levels[$user_id]) and substr($existing_permission_levels[$user_id], 0, 3) === "110") ? 'selected="selected"' : ''; ?>>Can view and edit this <?php echo strtolower(singular(humanize($humanized))) ?></option>
                                    <option value="111" <?php echo (isset($existing_permission_levels[$user_id]) and substr($existing_permission_levels[$user_id], 0, 3) === "111") ? 'selected="selected"' : ''; ?>>Can view, edit and delete this <?php echo strtolower(singular(humanize($humanized))) ?></option>
                                </select>
                            </div>
                        </div>
                    </label>
                    <?php if ($CI->assignments->_can_be_sent($item_type) or $CI->assignments->_can_be_generated($item_type)): ?>
                        <div class="can_be_sent_or_generated">
                            <span class='label-span'>&nbsp;</span>
                            <div class='select'>
                                    <?php if ($CI->assignments->_can_be_generated($item_type)): ?><label><input class="generate" value="1" <?php echo (isset($existing_permission_levels[$user_id][4]) and $existing_permission_levels[$user_id][4] == 1) ? 'checked="checked"' : '' ?> type="checkbox"> <span>Can generate invoices from this <?php echo strtolower(singular(humanize($humanized)));?></span></label><?php endif;?>
                                    <?php if ($CI->assignments->_can_be_sent($item_type)): ?><label><input class="send" value="1" <?php echo (isset($existing_permission_levels[$user_id][3]) and $existing_permission_levels[$user_id][3] == 1) ? 'checked="checked"' : '' ?> type="checkbox"> <span>Can send this <?php echo strtolower(singular(humanize($humanized)));?> to the client</span></label><?php endif;?>
                            </div>
                        </div>
                    <?php endif; ?>
                </div>
                <?php if ($item_type == 'clients'): ?>
                    <div class="permissions_breakdown" <?php echo (isset($existing_permission_levels[$user_id]) and $existing_permission_levels[$user_id] > 0) ? 'style="display: block;"' : '' ?>>
                        <?php foreach ($available_item_types as $module): ?>
                            <div class='parent-module'>
                                <?php $humanized_client_module = humanize($module == 'project_expenses' ? 'expenses' : $module); ?>
                                <?php $human_plural_client_module = strtolower(plural($humanized_client_module)); ?>
                                <label><span class='label-span'><?php echo $humanized_client_module; ?></span>
                                    <div class='select'>
                                        <div class="sel-item dropdown-arrow">
                                            <input class="value" value='<?php echo (isset($existing_breakdown[$user_id][$module]) ? $existing_breakdown[$user_id][$module] : ''); ?>' type="hidden" name="pancake_assignment_data[breakdown][<?php echo $user_id; ?>][<?php echo $module; ?>]">
                                            <select>
                                                <option value="00000" <?php echo (isset($existing_breakdown[$user_id][$module]) and substr($existing_breakdown[$user_id][$module], 0, 5) === "00000") ? 'selected="selected"' : ''; ?>>No access</option>
                                                <option value="10100" <?php echo (isset($existing_breakdown[$user_id][$module]) and substr($existing_breakdown[$user_id][$module], 0, 5) === "10100") ? 'selected="selected"' : ''; ?>>Can view all of this client's <?php echo $human_plural_client_module ?></option>
                                                <option value="10110" <?php echo (isset($existing_breakdown[$user_id][$module]) and substr($existing_breakdown[$user_id][$module], 0, 5) === "10110") ? 'selected="selected"' : ''; ?>>Can view and edit all of this client's <?php echo $human_plural_client_module ?></option>
                                                <option value="11111" <?php echo (isset($existing_breakdown[$user_id][$module]) and substr($existing_breakdown[$user_id][$module], 0, 5) === "11111") ? 'selected="selected"' : ''; ?>>Can view, edit, create and delete all of this client's <?php echo $human_plural_client_module ?></option>
                                                <option value="01111" <?php echo (isset($existing_breakdown[$user_id][$module]) and substr($existing_breakdown[$user_id][$module], 0, 5) === "01111") ? 'selected="selected"' : ''; ?>>Can create <?php echo $human_plural_client_module ?>, but can only view, edit and delete OWN <?php echo $human_plural_client_module ?></option>
                                            </select>
                                        </div>
                                    </div>
                                </label>
                                <?php if ($CI->assignments->_can_be_generated($module) or $CI->assignments->_can_be_sent($module)): ?>
                                <div>
                                    <span class='label-span'>&nbsp;</span>
                                    <div class='select'>
                                        <?php if ($CI->assignments->_can_be_generated($module)): ?>
                                            <label><input class="generate" value="1" <?php echo (isset($existing_breakdown[$user_id][$module]) and $existing_breakdown[$user_id][$module][5] == 1) ? 'checked="checked"' : '' ?> type="checkbox"> Can generate invoices from <?php echo $human_plural_client_module;?></label>
                                        <?php endif; ?>
                                        <?php if ($CI->assignments->_can_be_sent($module)): ?>
                                            <label><input class="send" value="1" <?php echo (isset($existing_breakdown[$user_id][$module]) and $existing_breakdown[$user_id][$module][6] == 1) ? 'checked="checked"' : '' ?> type="checkbox"> Can send <?php echo $human_plural_client_module;?> to the client</label>
                                            <?php endif; ?>
                                    </div>
                                </div>
                                <?php endif; ?>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>
        <?php endforeach; ?>
    </div>
</div>