<?php defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * Elements Exist
 *
 * Unlike elements(), this will only return $items that are present in $array
 * This prevents data from being represented when it should be omitted
 * 
 * @param  array
 * @param  array
 * @return array
 */
function elements_exist($items, $array)
{
    $items = (array) $items;

    $subset = array();
    foreach ($items as $i)
    {
        if (isset($array[$i]))
        {
            $subset[$i] = $array[$i];
        }
    }

    return $subset;
}