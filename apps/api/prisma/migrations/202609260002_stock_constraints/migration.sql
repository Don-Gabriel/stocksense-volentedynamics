-- Fundamental quantity invariants also apply to direct database writes.
ALTER TABLE "Product" ADD CONSTRAINT "product_cost_nonnegative" CHECK ("unitCost" >= 0);
ALTER TABLE "StockBalance" ADD CONSTRAINT "stock_nonnegative" CHECK ("onHand" >= 0 AND "version" >= 0);
ALTER TABLE "Reservation" ADD CONSTRAINT "reservation_positive" CHECK ("quantity" > 0);
ALTER TABLE "OperationLine" ADD CONSTRAINT "line_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "ReorderRule" ADD CONSTRAINT "rule_thresholds_valid" CHECK ("minimum" >= 0 AND "target" >= "minimum");
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "ledger_arithmetic_valid" CHECK ("before" >= 0 AND "after" >= 0 AND "after" = "before" + "delta");
ALTER TABLE "Operation" ADD CONSTRAINT "operation_locations_valid" CHECK (
  ("type" = 'RECEIPT' AND "sourceId" IS NULL AND "destinationId" IS NOT NULL AND "contactId" IS NOT NULL) OR
  ("type" = 'DELIVERY' AND "sourceId" IS NOT NULL AND "destinationId" IS NULL AND "contactId" IS NOT NULL) OR
  ("type" = 'TRANSFER' AND "sourceId" IS NOT NULL AND "destinationId" IS NOT NULL AND "sourceId" <> "destinationId" AND "contactId" IS NULL) OR
  ("type" = 'ADJUSTMENT' AND "sourceId" IS NULL AND "destinationId" IS NOT NULL AND "contactId" IS NULL AND length(trim("reason")) > 0)
);
ALTER TABLE "Operation" ADD CONSTRAINT "operation_completion_valid" CHECK (("status" = 'DONE') = ("completedAt" IS NOT NULL));
