<?php

class Payeezy_Client
{
  /**
   * @var string The Payeezy API key to be used for requests.
   */
  public static $apiKey;
  
  /**
   * @var string The Payeezy API Secret to be used for requests.
   */
  public static $apiSecret;
  
  /**
   * @var string The Payeezy Merchant Token to be used for requests.
   */
  public static $merchantToken;
  
  /**
   * @var string The Payeezy URL to be used for requests.
   */
  public static $url;

  const VERSION = '1.0.0';

  /**
   * @return string The API key used for requests.
   */
  public static function getApiKey()
  {
    return self::$apiKey;
  }

  /**
   * Sets the API key to be used for requests.
   *
   * @param string $apiKey
   */
  public static function setApiKey($apiKey)
  {
    self::$apiKey = $apiKey;
  }

  /**
   * @return string The API key used for requests.
   */
  public static function getApiSecret()
  {
    return self::$apiSecret;
  }
  
  /**
   * Sets the API key to be used for requests.
   *
   * @param string $apiKey
   */
  public static function setApiSecret($apiSecret)
  {
    self::$apiSecret = $apiSecret;
  }

  /**
   * @return string The API key used for requests.
   */
  public static function getMerchantToken()
  {
    return self::$merchantToken;
  }
  
  /**
   * Sets the API key to be used for requests.
   *
   * @param string $apiKey
   */
  public static function setMerchantToken($merchantToken)
  {
    self::$merchantToken = $merchantToken;
  }
  

  /**
   * @return string The API key used for requests.
   */
  public static function getUrl()
  {
    return self::$url;
  }
  
  /**
   * Sets the API key to be used for requests.
   *
   * @param string $apiKey
   */
  public static function setUrl($url)
  {
    self::$url = $url;
  }
}
