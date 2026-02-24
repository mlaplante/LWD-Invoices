<?php

if (!defined('BASEPATH')) {
    exit('No direct script access allowed');
}

$config['stripe_curlopts'] = [CURLOPT_SSLVERSION => CURL_SSLVERSION_TLSv1_2];