<?php

/**
 * Get the value inputted by the user, for populating a form.
 * 
 * Differences compared with CI's set_value():
 * 
 * 1. Support for POST field arrays.
 * 
 * 2. Support for fields not validated with the form validator. This solves a problem
 * where we didn't add validation to some fields and as a result the form wouldn't repopulate correctly.
 *
 * @param string $field
 * @param string $default
 * @return string
 */
function set_value($field = '', $default = '') {
    if (stristr($field, '[') !== false) {
        # It uses field arrays, let's work with that.
        $field = explode('[', $field);
        $arrayIndex = str_ireplace(']', '', $field[1]);
        $field = $field[0];

        $return = (isset($_POST[$field][$arrayIndex])) ? form_prep($_POST[$field][$arrayIndex], $field) : $default;
    } else {
        $return = (isset($_POST[$field])) ? form_prep($_POST[$field], $field) : $default;
    }

    return $return;
}

/**
 * Get checked="checked" if a checkbox was checked.
 * 
 * This relies on the improved set_value(), which adds support for POST field arrays
 * and removes the dependency on CI's Form Validation system.
 * 
 * @param string $field
 * @param string $expected_value
 * @param boolean $default
 * @return string
 */
function set_checkbox($field = '', $expected_value = '', $default = false) {
    $value = set_value($field);
    if ($value == $expected_value or $default) {
        $return = 'checked="checked"';
    } else {
        $return = '';
    }

    return $return;
}
