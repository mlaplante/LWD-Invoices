<?php

declare(strict_types=1);

function site_url(string $url = ""): string
{
    static $real_base = null;

    if ($real_base === null) {
        $index = get_instance()->config->item("index_page");
        $real_base = BASE_URL;

        if (!empty($index)) {
            $real_base = $real_base . $index . "/";
        }
    }

    return $real_base . ltrim($url, '/');
}