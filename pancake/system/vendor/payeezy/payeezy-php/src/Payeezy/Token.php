<?php

class Payeezy_Token extends Payeezy_TransactionType
{

  public function __construct($client)
  {
    parent::__construct('token', $client);
  }
}
