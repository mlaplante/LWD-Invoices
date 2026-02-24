<div id="notes-<?php echo $task['id'] ?>" class="hide">
    <div id="modal-header">
        <h3 class="ttl ttl3"><?php echo $task['name'] ?>: Notes</h3>
    </div>

    <?php echo auto_typography($task['notes']) ?>
</div>