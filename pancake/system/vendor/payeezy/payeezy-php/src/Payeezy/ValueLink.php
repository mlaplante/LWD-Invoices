<?php

class Payeezy_ValueLink extends Payeezy_TransactionType
{

  public function __construct($client)
  {
    parent::__construct('valuelink', $client);
  }
}
