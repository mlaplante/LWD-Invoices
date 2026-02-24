<?php foreach ($my_upcoming_tasks as $task): ?>
    <?php
    
    $task['id'] = $task['task_id'];
    $task['parent_id'] = null;
    $task['due_date'] = $task['task_due_date'];
    $task['name'] = $task['task_name'];
    
    $this->load->view("projects/_task_row_new", array(
        'is_subtask' => false,
        'is_milestone' => false,
        'is_dashboard' => true,
        'border_color' => '',
        'task' => $task,
    ));
    ?>
<?php endforeach; ?>
