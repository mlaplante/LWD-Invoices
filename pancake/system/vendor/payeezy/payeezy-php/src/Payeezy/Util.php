<?php

class Payeezy_Util
{

  public function processInput($data)
  {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return strval($data);
  }
}
