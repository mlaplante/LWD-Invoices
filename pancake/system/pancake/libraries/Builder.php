<?php

declare(strict_types=1);

/**
 * The database builder class.
 * Here to reduce the reliance on what has become far too many helper functions.
 */
class Builder
{
    /**
     * @var CI_DB_forge
     */
    protected $dbforge;

    /**
     * @var CI_DB_query_builder
     */
    protected $db;

    /**
     * @var Pancake_Controller
     */
    protected $ci;

    /**
     * Builder constructor.
     */
    function __construct()
    {
        $this->ci = get_instance();
        $this->ci->load->dbforge();
        $this->db = $this->ci->db;
        $this->dbforge = $this->ci->dbforge;
    }

    /**
     * Creates a database table.
     *
     * @param string $table
     * @return bool
     */
    function create_table(string $table): bool
    {
        $this->dbforge->add_field([
            'id' => [
                'type' => 'INT',
                'constraint' => 11,
                'unsigned' => true,
                'auto_increment' => true
            ]
        ]);
        $this->dbforge->add_key("id", true);
        return $this->dbforge->create_table($table, true, [
            'ENGINE' => 'InnoDB',
        ]);
    }

    /**
     * Creates a database table with the following default columns:
     * id
     * created_at
     * updated_at
     * deleted_at
     * owner_id
     *
     * @param $table
     */
    function create_default_table($table)
    {
        if (!$this->db->table_exists($table)) {
            $this->dbforge->add_field([
                'id' => [
                    'type' => 'INT',
                    'constraint' => 11,
                    'unsigned' => true,
                    'auto_increment' => true
                ]
            ]);
            $this->dbforge->add_key("id", true);
            $this->dbforge->add_field("`created_at` datetime NOT NULL");
            $this->dbforge->add_field("`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
            $this->dbforge->create_table($table, true, [
                'ENGINE' => 'InnoDB',
            ]);
            $this->create_column($table, "deleted_at", "datetime", null, null, true);
            $this->create_relationship_column($table, "owner_id", "users", true);
        }
    }

    /**
     * Drops an entire table.
     *
     * @param string $table
     * @return bool
     */
    function delete_table($table)
    {
        return $this->dbforge->drop_table($table, true);
    }

    /**
     * Deletes a column if it exists.
     * Will also delete foreign keys associated with that column, if any.
     *
     * @param string $table
     * @param string $field
     * @return bool
     */
    function delete_column($table, $field)
    {
        if ($this->column_exists($table, $field)) {
            if ($this->has_relationship($table, $field)) {
                $table = $this->get_prefixed_table_name($table);
                $rel_name = $this->get_constraint_name($table, $field);
                $this->db->query("alter table `$table` drop foreign key `$rel_name`");
            }

            return $this->dbforge->drop_column($table, $field);
        } else {
            return true;
        }
    }

    public function has_index(string $table, string $index): bool
    {
        $table = $this->get_prefixed_table_name($table);
        $result = $this->db->query("show index from $table where Key_name = " . $this->db->escape($index))->row_array();
        return isset($result["Key_name"]);
    }

    public function delete_index(string $table, string $index): bool
    {
        if ($this->has_index($table, $index)) {
            $table = $this->get_prefixed_table_name($table);
            return $this->db->query("alter table `$table` drop index `$index`");
        } else {
            return true;
        }
    }

    public function has_relationship(string $table, string $field, ?string $rel_name = null): bool
    {
        $table = $this->get_prefixed_table_name($table);
        $rel_name = $rel_name ?? $this->get_constraint_name($table, $field);

        $result = $this->db->query("SHOW COLUMNS FROM $table LIKE '{$field}'")->row_array();
        if (isset($result['Field']) && $result['Field'] == $field) {
            $sql = "SELECT count(0) as count FROM information_schema.TABLE_CONSTRAINTS
WHERE information_schema.TABLE_CONSTRAINTS.CONSTRAINT_TYPE = 'FOREIGN KEY'
AND information_schema.TABLE_CONSTRAINTS.TABLE_SCHEMA = '{$this->db->database}'
AND information_schema.TABLE_CONSTRAINTS.TABLE_NAME = '$table'
AND information_schema.TABLE_CONSTRAINTS.CONSTRAINT_NAME = '$rel_name';";
            $result = $this->db->query($sql)->row_array();
            $count = $result['count'];
            return ($count > 0);
        } else {
            return false;
        }
    }

    /**
     * Get the details of a column's relationship.
     *
     * Returns null if the column does not exist or does not have a relationship.
     * Otherwise, returns an array with the following keys:
     * rel_table, rel_field, on_delete and on_update
     *
     * @param string $table
     * @param string $field
     * @return array|null
     * @throws Exception If there's an error with getting relationship details for a column.
     */
    protected function get_relationship($table, $field)
    {
        $table = $this->get_prefixed_table_name($table);
        $rel_name = $this->get_constraint_name($table, $field);

        if ($this->has_relationship($table, $field)) {
            $relationship = $this->db->query("show create table `$table`")->row_array()["Create Table"];
            $regex = '/^\\s*CONSTRAINT `' . $rel_name . '` FOREIGN KEY \\(`' . $field . '`\\) REFERENCES `(.*)` \\(`(.*)`\\) (?:ON DELETE (.*))?\s?ON UPDATE (.*?)$/uim';
            $matches = [];
            if (!preg_match($regex, $relationship, $matches)) {
                throw new Exception("Could not get relationship details for $table.$field.");
            } else {
                return [
                    "rel_table" => $matches[1],
                    "rel_field" => $matches[2],
                    "on_delete" => empty($matches[3]) ? "restrict" : $matches[3],
                    "on_update" => empty($matches[4]) ? "restrict" : $matches[4],
                ];
            }
        } else {
            return null;
        }
    }

    /**
     * Determine if a particular column exists.
     * Obeys table prefix rules.
     *
     * @param string $table
     * @param string $field
     *
     * @return bool
     */
    function column_exists($table, $field)
    {
        $this->db->data_cache = [];
        return $this->db->field_exists($field, $table);
    }

    /**
     * Determine if a particular table exists.
     * Obeys table prefix rules.
     * @param string $table
     * @return bool
     */
    public function table_exists(string $table): bool
    {
        $this->db->data_cache = [];
        return $this->db->table_exists($table);
    }

    /**
     * Determines whether or not a table is using InnoDB (and thus supports foreign keys).
     *
     * @param string $table
     *
     * @return bool
     */
    function is_innodb($table)
    {
        $table = $this->get_prefixed_table_name($table);
        $results = $this->db->query("SHOW TABLE STATUS WHERE Name = '$table'")->row_array();
        return ($results["Engine"] == "InnoDB");
    }

    /**
     * Idempotent - Adds an index to the database.
     *
     * @param string $table
     * @param string|array $columns
     * @param bool $is_unique
     * @param bool $is_primary
     * @throws RuntimeException If any of the $columns don't exist in the database.
     */
    function create_index($table, $columns, $is_unique = false, $is_primary = false)
    {
        if (!is_array($columns)) {
            $columns = [$columns];
        }

        foreach ($columns as $name) {
            if (!$this->column_exists($table, $name)) {
                throw new RuntimeException("The column '$name' doesn't exist in '$table'; cannot add an index for it.");
            }
        }

        $table = $this->get_prefixed_table_name($table);

        if ($is_primary) {
            $index_name = "PRIMARY";
        } else {
            $index_name = $this->get_constraint_name($table, implode("_", $columns), "index");
        }

        $index_exists = $this->db->query("SELECT COUNT(0)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE table_schema = '{$this->db->database}'
    AND   table_name   = '$table'
    AND   index_name   = '$index_name';")->row_array();
        $index_exists = (reset($index_exists) > 0);

        if (!$index_exists) {
            $columns = array_map(function ($column) {
                if (stristr($column, "``") !== false) {
                    throw new Exception("Column $column has a backtick and it shouldn't!");
                }
                return "`$column`";
            }, $columns);
            if ($is_primary) {
                $sql = "alter table $table add constraint primary key (" . implode(",", $columns) . ")";
            } else {
                $is_unique = $is_unique ? "UNIQUE" : "";
                $sql = "create $is_unique index $index_name on $table(" . implode(",", $columns) . ")";
            }

            $this->db->query($sql);
        }
    }

    /**
     * Safely renames a column, but only if it exists.
     *
     * It will retain the original column's structure and relationship, if there was one.
     *
     * @param string $table
     * @param string $old_name
     * @param string $new_name
     * @return bool
     * @throws Exception If there's an error with getting the details of a column.
     */
    function rename_column($table, $old_name, $new_name)
    {
        if ($this->column_exists($table, $old_name)) {
            $relationship = $this->get_relationship($table, $old_name);
            $this->delete_relationship($table, $old_name);
            $column = $this->db->query("show create table `$table`")->row_array()["Create Table"];
            $matches = [];
            if (!preg_match('/^\\s*`' . $old_name . '` (.*?),?$/uim', $column, $matches)) {
                throw new Exception("Could not get column details for $table.$old_name.");
            } else {
                $column_details = $matches[1];
                $this->db->query("alter table `$table` change `$old_name` `$new_name` $column_details");

                if (isset($relationship)) {
                    $this->create_relationship($table, $new_name, $relationship["rel_table"], $relationship["rel_field"], $relationship["on_update"], $relationship["on_delete"]);
                }
            }
        } else {
            return true;
        }
    }

    /**
     * Creates a view. Rebuilds it if a view with that name already exists.
     *
     * @param string $name
     * @param string $sql
     * @return boolean
     */
    function create_view($name, $sql)
    {
        $name = $this->db->escape_str($name);
        return $this->db->query("create or replace view $name as $sql");
    }

    /**
     * Creates a permissions for the user system.
     *
     * @param string $name
     * @param int $root_user_type_id
     * @return bool
     */
    function create_permission($name, $root_user_type_id = 1)
    {
        $where = ["key" => $name, "user_type_id" => $root_user_type_id];
        if ($this->db->where($where)->count_all_results("user_type_permissions") == 0) {
            return $this->db->insert("user_type_permissions", [
                "is_allowed" => 1,
                "key" => $name,
                "user_type_id" => $root_user_type_id,
            ]);
        } else {
            return true;
        }
    }

    /**
     * Creates a field in $table and a relationship to $rel_table.$rel_field.
     * By default the field is called "id" and the type is "unsigned integer(11)".
     * By default, on updating a record in $rel_table it cascades to $table and on delete it restricts.
     *
     * @param string $table
     * @param string $field
     * @param string $rel_table
     * @param string $on_update
     * @param string $on_delete
     * @param boolean $null
     * @param string $rel_field
     * @param string $type
     * @param int $constraint
     *
     * @return boolean
     */
    function create_relationship_column(
        $table,
        $field,
        $rel_table,
        $null,
        $on_update = "cascade",
        $on_delete = "restrict",
        $rel_field = "id",
        $type = "unsigned_int",
        $constraint = 11
    ) {
        $on_after_action = function () use ($table, $field, $rel_table, $rel_field, $on_update, $on_delete) {
            $this->create_relationship($table, $field, $rel_table, $rel_field, $on_update, $on_delete);
        };

        return $this->create_column($table, $field, $type, $constraint, null, $null, false, false, null, $on_after_action);
    }

    /**
     * Get the name of a table, prefixed.
     * Idempotent. Will prefix a table name if needed and leave it alone if not.
     *
     * @param string $table
     *
     * @return string
     */
    function get_prefixed_table_name($table)
    {
        if (substr($table, 0, strlen($this->db->dbprefix)) != $this->db->dbprefix) {
            $table = $this->db->dbprefix($table);
        }

        return $table;
    }

    /**
     * Get the builder-generated name of a relationship.
     *
     * @param string $table
     * @param string $field
     *
     * @return string
     */
    function get_constraint_name($table, $field, $separator = "rel")
    {
        $this->get_prefixed_table_name($table);
        $original_table = substr($table, strlen($this->db->dbprefix));
        return substr("{$original_table}_{$separator}_{$field}", 0, 64);
    }

    /**
     * Updates an existing foreign key relationship.
     *
     * @param string $table
     * @param string $field
     * @param string $rel_table
     * @param string $rel_field
     * @param string $on_update
     * @param string $on_delete
     * @return boolean
     */
    function edit_relationship($table, $field, $rel_table, $rel_field = "id", $on_update = "cascade", $on_delete = "restrict")
    {
        if ($this->column_exists($table, $field)) {
            $this->delete_relationship($table, $field);
            $this->create_relationship($table, $field, $rel_table, $rel_field, $on_update, $on_delete);
        } else {
            return true;
        }
    }

    /**
     * Creates a foreign key relationship.
     *
     * @param string $table
     * @param string $field
     * @param string $rel_table
     * @param string $rel_field
     * @param string $on_update
     * @param string $on_delete
     * @return boolean
     */
    function create_relationship($table, $field, $rel_table, $rel_field = "id", $on_update = "cascade", $on_delete = "restrict")
    {
        $table = $this->get_prefixed_table_name($table);
        $rel_name = $this->get_constraint_name($table, $field);
        $rel_table = $this->get_prefixed_table_name($rel_table);
        $sql = "alter table `$table` add constraint `$rel_name` foreign key (`$field`) references `$rel_table` (`$rel_field`) on delete $on_delete on update $on_update;";
        return $this->db->query($sql);
    }

    /**
     * Deletes an existing foreign key relationship.
     *
     * @param string $table
     * @param string $field
     * @return boolean
     */
    function delete_relationship($table, $field)
    {
        if ($this->column_exists($table, $field)) {
            $table = $this->get_prefixed_table_name($table);
            $rel_name = $this->get_constraint_name($table, $field);

            if ($this->has_relationship($table, $field)) {
                $this->db->query("alter table `$table` drop foreign key `$rel_name`");
            }
        } else {
            return true;
        }
    }

    /**
     * Adds a column to a database table only if that column does not already exist.
     *
     * @param string $table
     * @param string $name
     * @param string $type
     * @param mixed $constraint
     * @param mixed $default
     * @param boolean $null
     * @param boolean $unique
     * @param boolean $auto_increment
     * @param string $after_field
     * @param callable $on_after_create
     *
     * @return boolean
     */
    function create_column(
        $table,
        $name,
        $type,
        $constraint = null,
        $default = null,
        $null = true,
        $unique = false,
        $auto_increment = false,
        $after_field = null,
        $on_after_create = null
    ) {
        return $this->create_or_edit_column($table, $name, $type, $constraint, $default, $null, $unique, $auto_increment, $after_field,
            $on_after_create);
    }

    /**
     * Edits a column in a database table only if that column exists.
     *
     * @param string $table
     * @param string $name
     * @param string $type
     * @param mixed $constraint
     * @param mixed $default
     * @param boolean $null
     * @param boolean $unique
     * @param boolean $auto_increment
     * @param string $after_field
     * @param callable $on_after_edit
     *
     * @return boolean
     */
    function edit_column(
        $table,
        $name,
        $type,
        $constraint = null,
        $default = null,
        $null = true,
        $unique = false,
        $auto_increment = false,
        $after_field = null,
        $on_after_edit = null
    ) {
        return $this->create_or_edit_column($table, $name, $type, $constraint, $default, $null, $unique, $auto_increment, $after_field,
            $on_after_edit, "edit");
    }

    /**
     * Adds/edits a column in a table (only edits if $modify_if_exists is true).
     *
     * @param string $table
     * @param string $name
     * @param string $type
     * @param mixed $constraint
     * @param mixed $default
     * @param boolean $null
     * @param boolean $unique
     * @param boolean $auto_increment
     * @param string $after_field
     * @param callable $on_after_action
     * @param string $action Either create or edit.
     *
     * @return boolean
     */
    function create_or_edit_column(
        $table,
        $name,
        $type,
        $constraint = null,
        $default = null,
        $null = true,
        $unique = false,
        $auto_increment = false,
        $after_field = null,
        $on_after_action = null,
        $action = "create"
    ) {
        $properties = array(
            'type' => $type,
            'null' => $null,
            'unique' => $unique,
            'auto_increment' => $auto_increment,
        );

        if ($type == "unsigned_int") {
            $properties["type"] = "INT";
            $properties["unsigned"] = true;
        }

        if ($type == "boolean") {
            $default = $default ? 1 : 0;
        }

        if ($type == "enum" && is_array($constraint)) {
            $constraint = implode(",", array_map(function ($value) {
                return $this->db->escape($value);
            }, $constraint));
        }

        if ($type == "decimal" && is_array($constraint)) {
            $constraint = implode(",", array_map(function ($value) {
                return $this->db->escape($value);
            }, $constraint));
        }

        if ($default !== null) {
            $properties['default'] = $default;
        }

        if ($constraint !== null) {
            $properties['constraint'] = $constraint;
        }

        if (!empty($after_field)) {
            $properties['after'] = $after_field;
        }

        $field_exists = $this->column_exists($table, $name);
        if ($action == "create") {
            if (!$field_exists) {
                $this->dbforge->add_column($table, [$name => $properties]);

                if (is_callable($on_after_action)) {
                    call_user_func($on_after_action);
                }
            }
        } else {
            if ($field_exists) {
                $this->dbforge->modify_column($table, [$name => $properties]);

                if (is_callable($on_after_action)) {
                    call_user_func($on_after_action);
                }
            }
        }

        return true;
    }

}
