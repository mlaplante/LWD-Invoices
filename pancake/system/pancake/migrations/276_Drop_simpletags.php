<?php

defined('BASEPATH') or exit('No direct script access allowed');

class Migration_Drop_simpletags extends Pancake_Migration
{

    public function up()
    {
        foreach (['email_settings_templates', 'email_templates'] as $table) {
            foreach ($this->db->get($table)->result_array() as $row) {
                $changed = [];

                foreach (["subject", "message", "content"] as $var) {
                    if (isset($row[$var])) {
                        $new = preg_replace('/(?<!{){([^:{}]+)}/u', '{{$1}}', $row[$var]);
                        if ($new != $row[$var]) {
                            $changed[$var] = $new;
                        }

                        $new = preg_replace('/(?<!{){([^:{}]+):([^:{}]+)}/u', '{{$1.$2}}', $row[$var]);
                        if ($new != $row[$var]) {
                            $changed[$var] = $new;
                        }
                    }
                }

                if (count($changed)) {
                    $this->db->where(['id' => $row['id']])->set($changed)->update($table);
                }
            }
        }
    }

    public function down()
    {

    }

}
