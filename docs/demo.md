# Demo walkthrough

1. Sign in as `manager`. Show dashboard counts, scheduled operations, overdue documents, and replenishment suggestions. Switch the warehouse scope to show location-aware totals.
2. Open Products. Add an item with a SKU, category, unit, and optional opening quantity. Show the corresponding opening-stock entry in Move history.
3. Create a receipt for 100 units into Main Stock. Save its draft and confirm it. Explain that stock still has not moved. Validate and show 100 on hand.
4. Create a delivery for 20 units. Confirm it, then open Stock to show 100 on hand, 20 reserved, and 80 available. Pick, pack, and validate. Physical stock becomes 80 and the reservation disappears.
5. Create an internal transfer of 30 units to Production Rack. Confirm and validate. Main Stock has 50, the rack has 30, and the combined quantity stays 80. History shows both `−30` and `+30`.
6. Count 48 units in Main Stock. Create and validate an adjustment with a reason. Show the `−2` history entry and updated balance of 48.
7. Create a delivery for more than the available quantity. Confirm it to demonstrate Waiting and the shortage highlight. Receive more stock, then check availability again.
8. Show operation search, status filters, the Kanban view, a completed document’s Print action, and the profile page.
9. Sign in as `warehouse` to show the staff role. Staff can process ordinary movements; manager settings and physical counts are protected.
10. Optional: demonstrate Forgot password using the [local Mailpit inbox](http://127.0.0.1:8025). Clearly identify this as local email capture.

## Scope mapping

| Problem requirement                             | Implementation                                                 |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Login, signup, OTP recovery                     | Auth screens and server-side sessions                          |
| Products, categories, unit, cost, opening stock | Catalog and recorded opening adjustments                       |
| Receipts and deliveries                         | Draft/confirm/validate documents; delivery picking and packing |
| Internal movements                              | Reserved, atomic source-to-destination transfers               |
| Physical stock corrections                      | Manager counts with signed deltas and stale-count protection   |
| Warehouse and room/rack locations               | Warehouse/location settings and scope filters                  |
| On-hand and free-to-use stock                   | Per-location on-hand, reserved, and available quantities       |
| Low-stock and reorder suggestions               | Per-location minimum and target rules                          |
| Dashboard and status summaries                  | KPIs, operation cards, overdue list, activity, alerts          |
| Search, list/Kanban, printable documents        | Operation screens and print stylesheet                         |
| Stock movement history                          | Immutable API ledger with before/after quantities and actor    |
| Zero-cost demonstration                         | Local Node.js, PostgreSQL, browser, and Mailpit                |

## Deliberate choices

- A partial delivery/backorder workflow is not implemented. Short documents wait as a whole; this avoids silent partial stock changes.
- Move history contains **validated physical movements**. Planned and canceled documents remain searchable in Operations and its Kanban view.
- Printing uses the browser’s free Print / Save as PDF function.
- No paid AI, email, database, hosting, domain, or monitoring service is required.
