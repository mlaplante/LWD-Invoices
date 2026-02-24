<?php

class Payeezy_Paypal extends Payeezy_TransactionType
{

  public function __construct($client)
  {
    parent::__construct('paypal', $client);
  }
}
