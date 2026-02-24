<div class="six columns">
    <h4 class="ttl ttl3"><?php echo $title; ?> <span class="report-per"><?php echo $per; ?></span>
        <span class="report-daterange"><?php echo __("reports:verb_from_to", array($verb, format_date($from), format_date($to))); ?></span>
    </h4>

    <div class="report-overview report-<?php echo $report; ?> report-type-<?php echo $chart_type; ?>">
        <div class="graph" style="height:229px;"></div>
        <div class="total"><?php echo $formatted_total; ?></div>
        <a href="<?php echo $report_url; ?>"><?php echo __('reports:view'); ?></a>
    </div>
</div>

<script>
    <?php if (is_array($chart_totals) and count($chart_totals) > 0) :?>
    <?php if ($chart_type == 'pie') :?>

    <?php
    $new_chart_totals = array();
    $percent_threshold = 10;
    arsort($chart_totals);

    $i = 1;
    foreach ($chart_totals as $label => $total) {
        $percentage = $report_total > 0 ? (($total/$report_total)*100) : 0;
        if ($i > 5 and ($percentage < $percent_threshold)) {
            if (!isset($new_chart_totals[__("global:other")])) {
                $new_chart_totals[__("global:other")] = 0;
            }

            $new_chart_totals[__("global:other")] += $total;
        } else {
            $new_chart_totals[$label] = $total;
        }
        $i++;
    }
    ?>

    var data = [<?php $i =0; foreach($new_chart_totals as $label => $total) {if ($i != 0) {echo ',';} echo "{label: \"$label\", data: $total}";$i = 1;}?>];


    $.plot($(".report-<?php echo $report;?> .graph"), data, {
        series: {
            pie: {
                show: true,
                radius: 1,
                label: {
                    show: true,
                    radius: 1.75 / 3,
                    formatter: function (label, series) {
                        return '<div style="font-size:8pt;text-align:center;padding:2px;color:white;">' + label + '<br/>' + Math.round(series.percent) + '%</div>';
                    },
                    threshold: 0.1
                }
            }
        },
        legend: {
            show: false
        }
    });
    <?php else:?>
    var data = [<?php $i =0; foreach($chart_time_points as $label => $times) { $total = '['; foreach ($times as $time => $amount) {$total .= "[".($time * 1000).", $amount], ";} $total = substr($total, 0, strlen($total) - 2).']'; if ($i != 0) {echo ',';} echo "{label: \"$label\", data: $total}";$i = 1;}?>];
    $.plot($(".report-<?php echo $report;?> .graph"), data, {xaxis: {mode: 'time', timeformat: "%m/%d"}});
    <?php endif;?>
    <?php else: ?>
    $(".report-<?php echo $report;?> .graph").html('<?php echo __('reports:nodata', array($title));?>').addClass('no-data');
    <?php endif;?>
</script>