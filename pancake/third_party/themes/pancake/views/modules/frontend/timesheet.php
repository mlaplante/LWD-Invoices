<div id="table_wrapper">

    <table class="timesheet-table">
        <tr>
            <?php if ($count_users > 1) : ?>
                <th class="timesheet_user">User</th>
            <?php endif; ?>
            <th class="timesheet_date"><?php echo __('timesheet:date'); ?></th>
            <th class="timesheet_duration"><?php echo __('timesheet:duration'); ?></th>
            <th class="timesheet_task"><?php echo __('timesheet:taskname'); ?> </th>
            <th class="timesheet_notes"><?php echo __('global:notes'); ?></th>
        </tr>
        <?php
        $has_rounding = (process_hours(Settings::get('task_time_interval')) > 0);
        ?>
        <?php foreach ($times as $item) : ?>
            <tr>
                <?php if ($count_users > 1) : ?>
                    <td class="timesheet_user"><?php echo $item['first_name'] . ' ' . $item['last_name']; ?></td>
                <?php endif; ?>
                <td class="timesheet_date">
                    <?php if (!$has_rounding): ?>
                        <span class="time"><?php echo $item['start_time']; ?> - <?php echo $item['end_time']; ?>
                            <br/></span>
                    <?php endif; ?>
                    <span class="date"><?php echo format_date($item['date']); ?></span>
                </td>
                <?php $hours = round($item['minutes'] / 60, 2); ?>
                <td class="timesheet_duration"><?php echo format_hours($hours); ?></td>
                <td class="timesheet_task"><?php echo $tasks[$item['task_id']]['name']; ?></td>
                <td class="timesheet_notes"><?php echo $item['note']; ?></td>
            </tr>
        <?php endforeach; ?>
    </table>

</div><!-- /table_wrapper -->
