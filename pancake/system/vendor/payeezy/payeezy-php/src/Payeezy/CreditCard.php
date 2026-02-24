<?php

class Payeezy_CreditCard extends Payeezy_TransactionType
{

  public function __construct($client)
  {
    parent::__construct('credit_card', $client);
  }
}
