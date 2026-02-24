<?php

class Payeezy_Error extends Exception
{
  public function __construct($correlation_id, $errorResponse)
  {
    
    $this->httpStatus = $correlation_id;
    $httpBodyArray = array();
    foreach ($errorResponse->messages as $message) {
      $httpBodyArray[] = $message->description;
    }
    $this->httpBody = implode(", ", $httpBodyArray);
    $this->jsonBody = json_encode($errorResponse, JSON_FORCE_OBJECT);
    parent::__construct($message = $this->httpBody);
  }

  public function getHttpStatus()
  {
    return $this->httpStatus;
  }

  public function getHttpBody()
  {
    return $this->httpBody;
  }

  public function getJsonBody()
  {
    return $this->jsonBody;
  }
}
