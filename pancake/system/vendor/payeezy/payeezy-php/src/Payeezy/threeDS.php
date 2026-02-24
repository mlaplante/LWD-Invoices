<?php

class Payeezy_threeDS extends Payeezy_TransactionType
{

  public function __construct($client)
  {
    parent::__construct('3ds', $client);
  }
}
