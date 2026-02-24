<?php

/**
 * Set mode to test or production.  This determines which endpoints are used.
 * 
 * DEFAULT: test 
 */
$config['mode'] = USE_SANDBOX ? 'test' : 'production';

/**
 * Force Secure Connection. Should only be turned to FALSE if testing.
 * 
 * DEFAULT: TRUE 
 */
$config['force_secure_connection'] = !USE_SANDBOX;
