<?php

class Payeezy_TeleCheck extends Payeezy_TransactionType
{

  public function __construct($client)
  {
    parent::__construct('tele_check', $client);
  }
}
