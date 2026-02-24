<?php /** @var \Pancake\Reports\Report $report */ ?>
<table class="report-contents timesheet-table">
    <thead>
        <tr>
            <?php foreach ($report->getFields() as list($label, $type)) : ?>
                <th><?php echo $label; ?></th>
            <?php endforeach; ?>
        </tr>
    </thead>
    <tfoot>
        <tr>
            <?php $total_fields = $report->getTotalFields(); ?>
            <?php foreach (array_keys($report->getFields()) as $field) : ?>
                <th>
                    <?php if (in_array($field, $total_fields)): ?>
                        <?php echo $report->format($field, $report->getTotal($field)); ?>
                    <?php endif; ?>
                </th>
            <?php endforeach; ?>
        </tr>
    </tfoot>
    <tbody>
        <?php foreach ($report->getRows() as $row) : ?>
            <tr>
                <?php foreach (array_keys($report->getFields()) as $field) : ?>
                    <td><?php echo $report->format($field, $row[$field]); ?></td>
                <?php endforeach; ?>
            </tr>
        <?php endforeach; ?>
    </tbody>
</table>