-- One Payment row per processor transaction.
--
-- Every Stripe path (checkout webhook, charge-saved, off-session autopay, and
-- the payment_intent.succeeded backstop) writes the PaymentIntent id into
-- "transactionId", so this index makes double-recording impossible regardless
-- of how those paths interleave.
--
-- Postgres treats NULLs as distinct in unique indexes, so manually recorded
-- payments (cash, bank transfer) that carry no transaction id are unaffected
-- and may repeat freely.
CREATE UNIQUE INDEX "Payment_organizationId_transactionId_key"
  ON "Payment" ("organizationId", "transactionId");
