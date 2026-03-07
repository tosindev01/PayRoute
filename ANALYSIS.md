# PayRoute — Design & Analysis Document

## Schema Design Document

### 1. Why this structure?

The schema is built around three invariants that must never be violated in a payments system:

**Double-entry bookkeeping**: Every balance change is recorded in `ledger_entries` with both a `balance_before` and `balance_after`. Money cannot be created or destroyed — every debit on the sender side has a corresponding credit (immediately on sender account, later on recipient account via webhook). The `purpose` field distinguishes initial debits, reversals, and fees, making audits straightforward.

**Optimistic locking via `SELECT FOR UPDATE`**: Concurrent payment requests for the same account acquire a row-level lock before reading the balance. This prevents overdrafts without application-level mutexes, relying on PostgreSQL's MVCC instead.

**Immutable event log**: `transaction_status_history` and `webhook_events` are append-only. Nothing is updated or deleted. This enables complete reconstruction of any transaction's lifecycle and makes debugging production incidents deterministic.

I chose to separate `fx_quotes` from transactions because a quote has its own lifecycle (expiry, single-use locking). The `used_at` column is set atomically with a `WHERE used_at IS NULL AND expires_at > NOW()` guard — zero rows returned means the quote was already consumed.

### 2. How money is not created or destroyed

The enforcement happens in layers:

- **Constraint layer**: `CHECK (balance >= 0)` on `accounts.balance` — the database rejects any update that would create a negative balance even if application logic is buggy.
- **Application layer**: `debitAccount()` locks the row, reads the current balance, computes the new balance, and rejects if it's negative before issuing the `UPDATE`.
- **Ledger layer**: Every `debitAccount` and `creditAccount` call records `balance_before` and `balance_after`. The invariant `balance_after = balance_before ± amount` can be verified by any auditor by replaying the ledger from any checkpoint.
- **Double-entry verification**: For every completed transaction, the sum of all debit ledger entries should equal the sum of all credit entries plus fees. This can be verified with: `SELECT SUM(amount) FROM ledger_entries WHERE entry_type = 'debit' AND transaction_id = X` vs credits.

### 3. Adding a new currency pair in production

1. Insert the currency into the `currencies` table: `INSERT INTO currencies (code, name, decimals) VALUES ('JPY', 'Japanese Yen', 0)`.
2. Add the rate to the FX provider configuration (in production, the FX rate is fetched live — adding a pair just means the provider starts returning quotes for it).
3. Create accounts in the new currency for any relevant counterparties.
4. No schema migration required — currency codes are foreign keys to the `currencies` table, so the system automatically supports the new pair once the row exists.

### 4. One thing I would do differently with more time

I would add **event sourcing** for transaction state. Instead of mutating the `transactions.status` field, every state change would be an append-only event in a `transaction_events` table. The current status is derived by replaying events. This eliminates the possibility of losing intermediate states, makes reconciliation trivial (replay from any point), and makes the system naturally idempotent.

---

## 4A: Code Review — Junior Developer's Webhook Handler

### Issue 1: No signature verification actually performed
**Problem**: The code checks if the signature header is *present*, but never verifies it against the expected HMAC.
**Why it matters**: Attacker forgery of completion events.
**Fix**: Use `crypto.timingSafeEqual` with a computed HMAC.

### Issue 2: No raw body capture
**Problem**: HMAC must be computed over raw bytes, not re-serialized JSON.
**Fix**: Use custom middleware to capture `req.rawBody`.

### Issue 3: Not idempotent
**Problem**: Duplicate webhooks will double-credit/reverse.
**Fix**: Check `webhook_events` for existing `event_id` before processing.

### Issue 4: No state transition validation
**Problem**: Allows invalid transitions (e.g. completed to failed).
**Fix**: Validate incoming status against `VALID_TRANSITIONS` map.

### Issue 5: Non-atomic updates
**Problem**: No database transaction wrapping status and balance updates.
**Fix**: Wrap all operations in a `BEGIN/COMMIT` block with `FOR UPDATE` lock.

### Issue 6: Using body amounts
**Problem**: Credits based on `payload.amount` instead of internal source of truth.
**Fix**: Use `transaction.dest_amount` from the DB.

### Issue 7: Returns 404 for unknown references
**Problem**: Causes provider retries and leaks enumeration info.
**Fix**: Always return 200, log for investigation.

### Issue 8: No raw logging
**Problem**: Inability to reconstruct failed events or resolve disputes.
**Fix**: Log raw payload as the first operation.

---

## 4B: Failure Scenarios

### 1. Concurrent Duplicate POST /payments
**Handling**: Row-level locking via `SELECT FOR UPDATE` on the account ensures requests are serialized. The second request will see the reduced balance or the committed idempotency record.

### 2. Webhook Race Condition
**Handling**: If a webhook arrives before the provider reference is written, the lookup fails and returns 200. A background reconciliation job would check for unprocessed events.

### 3. FX Rate Expiry
**Handling**: TTL check on `fx_quotes` ensures we don't settle at stale rates. The system rejects used or expired quotes.

### 4. Partial Settlement / Reversal
**Handling**: Modeled as compensating ledger entries. We never "undo" a transaction; we add a new ledger entry that balances the books.

### 5. Provider Timeout
**Handling**: The system initiates reversal if the provider submission fails within the handler. In production, we would use an Outbox pattern for higher reliability.

---

## 4C: Production Readiness

1. **Distributed Locks (Redis)**: To prevent idempotency race conditions in multi-region deployments.
2. **Outbox Pattern**: To ensure provider submission occurs even if the API process crashes after committing the ledger.
3. **Structured Audit Trail**: Centralized logging of all ledger changes for regulatory compliance.
4. **Reconciliation Service**: Daily automated job to match internal ledgers against provider statements.
5. **Secrets Management**: Dynamic rotation of `WEBHOOK_SECRET` via AWS Secrets Manager.
