<?php

function detect_base_url($server, $fcpath) {

    $is_ssl = ((!empty($server['HTTPS']) && $server['HTTPS'] !== 'off') || (isset($server['SERVER_PORT']) && $server['SERVER_PORT'] == 443));

    # Override the backslashes that Windows uses; Pancake's code expects to find/replace forward slashes, so this resolves a couple of issues (#38648).
    $server["SCRIPT_FILENAME"] = str_ireplace("\\", "/", $server["SCRIPT_FILENAME"]);

    if (isset($server['HTTP_X_FORWARDED_PROTO'])) {
        # Must be either a single 'https' or a list of 'https,https,...'
        $protos = array_unique(array_map('trim', explode(',', $server['HTTP_X_FORWARDED_PROTO'])));
        $is_ssl = (count($protos) === 1 && $protos[0] === 'https');
    }

    if (isset($server["HTTP_CF_VISITOR"])) {
        # Using CloudFlare's Shared SSL; detect the original scheme.
        $server["HTTP_CF_VISITOR"] = json_decode($server["HTTP_CF_VISITOR"], true);
        $is_ssl = ($server["HTTP_CF_VISITOR"]["scheme"] == "https");
    }

    $scheme = $is_ssl ? "https" : "http";

    # Deal with port 10443 in cloud-shared-ssl.net. See #30858 for more details.
    if ($is_ssl && stristr($server["SERVER_NAME"], "cloud-shared-ssl.net") !== false && $server['SERVER_PORT'] == 10443) {
        $server['SERVER_PORT'] = 443;
        $server['SCRIPT_URI'] = str_replace(':10443', '', $server['SCRIPT_URI']);
    }

    # This is for servers with a misbehaving DOCUMENT_ROOT when loaded via a wildcard SSL (i.e. the document root isn't set specifically for each subdomain).
    # You can add it to any .htaccess like so: SetEnv PANCAKE_REAL_DOCUMENT_ROOT /path/to/document_root/
    if (isset($server["PANCAKE_REAL_DOCUMENT_ROOT"])) {
        $server["DOCUMENT_ROOT"] = $server["PANCAKE_REAL_DOCUMENT_ROOT"];

        if (substr($server["SCRIPT_NAME"], -strlen("/index.php")) == "/index.php") {
            $buffer = substr($server["SCRIPT_NAME"], 0, -strlen("/index.php"));
            if (stristr($server["DOCUMENT_ROOT"], $buffer) !== false) {
                $server["SCRIPT_NAME"] = "/index.php";
            }
        }

        if (substr($server["SCRIPT_FILENAME"], -strlen("/index.php")) == "/index.php") {
            $buffer = substr($server["SCRIPT_FILENAME"], 0, -strlen("/index.php"));
            if (stristr($server["DOCUMENT_ROOT"], $buffer) !== false) {
                $server["SCRIPT_FILENAME"] = "/index.php";
            }
        }
    }

    # Fix servers where the query string is not passed correctly.
    if (isset($server['QUERY_STRING']) and isset($server['REQUEST_URI']) and strstr($server['REQUEST_URI'], "?") !== false and substr(strstr($server['REQUEST_URI'], "?"), 1) != $server['QUERY_STRING']) {
        $server['QUERY_STRING'] = substr(strstr($server['REQUEST_URI'], "?"), 1);
    }

    # Remove the query string from the REQUEST_URI if it's there.
    $removed_from_request_uri = '';
    if (isset($server['REQUEST_URI']) and isset($server['QUERY_STRING']) and stripos($server['REQUEST_URI'], '?' . $server['QUERY_STRING']) !== false) {
        $server['REQUEST_URI'] = substr($server['REQUEST_URI'], 0, stripos($server['REQUEST_URI'], '?' . $server['QUERY_STRING']));
        $removed_from_request_uri = '?' . $server['QUERY_STRING'];
    }

    if (isset($server['HTTP_HOST'])) {
        $base_url = $scheme;
        $base_url .= '://' . $server['HTTP_HOST'] . '/';

        if (substr($server['SCRIPT_NAME'], 0, 2) == '/~' and substr($server['REQUEST_URI'], 0, 2) != '/~' and substr($server['SCRIPT_FILENAME'], 0, 6) == '/home/') {
            # Correct an issue with ~ dirs and RewriteBase.
            $script_name = explode('/', $server['SCRIPT_NAME']);
            unset($script_name[0]);
            unset($script_name[1]);
            unset($script_name[2]);
            $server['SCRIPT_NAME'] = "/" . implode('/', $script_name);
        }

        $path = isset($server['PATH_INFO']) ? $server['PATH_INFO'] : (isset($server['ORIG_PATH_INFO']) ? $server['ORIG_PATH_INFO'] : (basename($server['SCRIPT_NAME'])));

        # On some hosts, $path = [path-to-index.php]/index.php/path
        # If absolute path to index.php ends with [path-to-index.php]/index.php, then remove it from $path.
        if (stristr($path, '/index.php') !== false) {
            $buffer = explode('/index.php', $path);
            if (substr($server['SCRIPT_FILENAME'], -strlen($buffer[0] . '/index.php'))) {
                # Remove [path-to-index.php] from $path.
                $path = str_ireplace($buffer[0], '', $path);
            }
        }

        if (stristr($server['SCRIPT_NAME'], 'index.php') !== false) {
            # This fixes an issue where for some reason some servers said the script was called "Index.php",
            # even though it was really called "index.php". Crazy, right?
            $server['SCRIPT_NAME'] = str_ireplace('Index.php', 'index.php', $server['SCRIPT_NAME']);

            $script_name = explode('index.php', $server['SCRIPT_NAME']);
            $path = $script_name[0] . str_replace(array($path), '', $script_name[1]);
        } else {
            $path = str_replace(array($path, 'index.php'), '', $server['SCRIPT_NAME']);
        }

        if (substr($path, 0, 1) == '/') {
            $path = substr($path, 1, strlen($path) - 1);
        }
        $base_url .= $path;


        if (isset($server['SCRIPT_URI']) and !empty($server['SCRIPT_URI'])) {
            $parsed_script_uri = parse_url($server['SCRIPT_URI']);
            $base_url = $server['SCRIPT_URI'];

            # Fixes an issue with servers that add port numbers when they needn't.
            if (isset($parsed_script_uri['port']) && isset($parsed_script_uri['host'])) {
                if ($parsed_script_uri['port'] == 80 || $parsed_script_uri['port'] == 443) {
                    $parsed_script_uri_path = isset($parsed_script_uri['path']) ? $parsed_script_uri['path'] : "";

                    # Fixes an issue with servers that add two slashes to the path.
                    $parsed_script_uri_path = str_ireplace("//", "/", $parsed_script_uri_path);

                    $base_url = $scheme . "://" . $parsed_script_uri['host'] . $parsed_script_uri_path;
                }
            }


            if (!empty($server['PATH_INFO'])) {
                if (substr($server['PATH_INFO'], -10) == '/index.php') {
                    # This path info ends with index.php, it doesn't include request data.
                    if (isset($server['QUERY_STRING'])) {
                        if (substr($base_url, -strlen($server['QUERY_STRING'])) == $server['QUERY_STRING']) {
                            $base_url = substr($base_url, 0, -strlen($server['QUERY_STRING']));
                        }
                    }
                } else {
                    # Remove path info from base url.
                    if (substr($base_url, -strlen($server['PATH_INFO'])) == $server['PATH_INFO']) {
                        $base_url = substr($base_url, 0, -strlen($server['PATH_INFO']));
                    }

                    # Remove index.php from the end of the base URL, if necessary.
                    if (substr($base_url, -10) == '/index.php') {
                        $base_url = substr($base_url, 0, -10);
                    }
                }
            } elseif (!empty($server['REQUEST_URI'])) {
                $buffer = (substr($server['REQUEST_URI'], -1, 1) == '/') ? $server['REQUEST_URI'] : $server['REQUEST_URI'] . '/';
                $base_url = (substr($base_url, -1, 1) == '/') ? $base_url : $base_url . '/';

                # Sometimes, the buffer might include the folder to which the app belongs.
                # So. We'll find the script name, remove the index.php from it, that'll leave the path to the script.
                # Then, we remove the path to the script from the start of $buffer, that means that $buffer will only be the -proper- REQUEST_URI.
                $script_name_buffer = $server['SCRIPT_NAME'];
                if (substr($script_name_buffer, -9) == 'index.php') {
                    $script_name_buffer = substr($script_name_buffer, 0, -9);
                }

                if (substr($buffer, 0, strlen($script_name_buffer)) == $script_name_buffer) {
                    $buffer = substr($buffer, strlen($script_name_buffer)) . '';
                }

                if (substr($base_url, -strlen($buffer)) == $buffer) {
                    $base_url = substr($base_url, 0, -strlen($buffer));
                }
            }
        }

        # Add the forward slash, always.
        $base_url = (substr($base_url, -1, 1) == '/') ? $base_url : $base_url . '/';
    } else {
        $base_url = 'http://localhost/';
    }

    # Fix an issue with the REQUEST_URI in some server configurations.
    if (isset($server["SCRIPT_FILENAME"]) and isset($server["REQUEST_URI"])) {
        if (substr($server["SCRIPT_FILENAME"], -9) == "index.php") {
            $script_filename = substr($server["SCRIPT_FILENAME"], 0, -9);
            $pieces = explode("/", $server["REQUEST_URI"]);
            while (count($pieces) > 1) {
                array_pop($pieces);
                $possible_uri_string = implode("/", $pieces) . "/";
                $length = strlen($possible_uri_string);
                if (substr(strtolower($script_filename), -$length) == strtolower($possible_uri_string)) {
                    # Check that subdomain doesn't match:
                    $possible_subdomain = trim(strtolower($possible_uri_string), '/') . ".";
                    if (substr($server['HTTP_HOST'], 0, strlen($possible_subdomain)) != $possible_subdomain) {
                        if (strlen($server["REQUEST_URI"]) != $length) {
                            $server["REQUEST_URI"] = substr($server["REQUEST_URI"], $length);
                        } else {
                            $server["REQUEST_URI"] = "";
                        }
                    }
                    break;
                }
            }
        }
    }

    # Fix an issue with the REQUEST_URI in some server configurations.
    if (isset($server["SCRIPT_NAME"]) and isset($server["REQUEST_URI"])) {
        if (substr($server["SCRIPT_NAME"], -9) == "index.php") {
            $script_filename = substr($server["SCRIPT_NAME"], 0, -9);

            # Guarantee that the SCRIPT_NAME always has a forward slash at the start.
            $script_filename = "/" . ltrim($script_filename, "/");

            $pieces = explode("/", $server["REQUEST_URI"]);
            while (count($pieces) > 1) {
                array_pop($pieces);
                $possible_uri_string = implode("/", $pieces) . "/";
                $length = strlen($possible_uri_string);
                if (substr(strtolower($script_filename), -($length + 1)) == '/' . strtolower($possible_uri_string)) {
                    if (strlen($server["REQUEST_URI"]) != $length) {
                        $server["REQUEST_URI"] = substr($server["REQUEST_URI"], $length);
                    } else {
                        $server["REQUEST_URI"] = "";
                    }
                    break;
                }
            }
        }
    }

    if ($server["REQUEST_URI"] == "index.php") {
        $server["REQUEST_URI"] = "";
    }

    $server["REQUEST_URI"] = str_ireplace("index.php/", "", $server["REQUEST_URI"]);

    # Fixes an issue where .htaccess redirects requests for third_party/ files to Pancake.
    # This just makes Pancake understand those requests and serve those files, if they exist.
    if (substr($server["REQUEST_URI"], 0, strlen("third_party/")) == "third_party/") {
        # Fixes an issue where query strings are attached to the REQUEST_URI.
        $server["REQUEST_URI"] = explode("?", $server["REQUEST_URI"]);
        $server["REQUEST_URI"] = reset($server["REQUEST_URI"]);

        $third_party_path = realpath($server["REQUEST_URI"]);
        if (substr($third_party_path, 0, strlen($fcpath . "third_party/")) == $fcpath . "third_party/") {
            if (file_exists($third_party_path) and is_file($third_party_path)) {

                // Grab the file extension
                $extension = explode('.', $third_party_path);
                $extension = end($extension);

                include(APPPATH . 'config/mimes.php');

                // Set a default mime if we can't find it
                if (!isset($mimes[$extension])) {
                    $mime = 'application/octet-stream';
                } else {
                    $mime = (is_array($mimes[$extension])) ? $mimes[$extension][0] : $mimes[$extension];
                }

                set_status_header(200);

                $data = file_get_contents($third_party_path);

                if (strpos($server['HTTP_USER_AGENT'], "MSIE") !== false) {
                    header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
                    header('Pragma: public');
                } else {
                    header('Pragma: no-cache');
                }

                header('Content-Disposition: inline');
                header('Expires: 0');
                header("Content-Length: " . strlen($data));
                header('Content-Type: ' . $mime);
                echo $data;

                die;
            }
        }
    }

    # Add the query string back to REQUEST_URI if it was removed earlier on:
    $server['REQUEST_URI'] .= $removed_from_request_uri;
    
    # Fix routing by making sure the REQUEST_URI always has a leading slash.
    $server['REQUEST_URI'] = "/" . ltrim($server['REQUEST_URI'], "/");

    # Fix an issue where SCRIPT_NAME might contain part of the BASE_URL.
    # CI_URI had problems with that (e.g. an installation at /c would screw up the routing for /client_area).
    $server['SCRIPT_NAME'] = "/index.php";

    // Define these values to be used later on
    $guessed_base_url = strtolower((substr($base_url, -1) != '/') ? $base_url . '/' : $base_url);
    $guessed_base_url = str_ireplace('/index.php/', '/', $guessed_base_url);

    # Fix an issue where https:// would be replaced by http:// incorrectly.
    $guessed_base_url = str_ireplace(array("http://", "https://"), "$scheme://", $guessed_base_url);

    return [
        "is_ssl" => $is_ssl,
        "url" => $guessed_base_url,
        "server" => $server,
    ];
}
