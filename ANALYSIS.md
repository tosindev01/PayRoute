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

---

## Phase 2: Perfecting the Lifecycle (Implementation Detail)

### 1. Real-time FX Architecture
Instead of static rates, the system now features a **Live FX Ticker**. This is implemented via:
- **Backend Simulation**: A heartbeat endpoint `/fx/rates` that injects controlled volatility into major currency pairs (NGN to USD, GBP, EUR, AED).
- **Frontend Polling**: React Query with a 5-second `refetchInterval` to keep data fresh without overloading the pipe.
- **Visual Feedback**: Real-time trend indicators (▲/▼) driven by comparing local state to incoming payloads.

### 2. Webhook Lifecycle Simulation
To demonstrate "production behavior" in development:
- **Simulation Service**: An asynchronous handler triggered upon payment submission. It randomizes delays (10–40s) and outcomes (Success vs. Fail).
- **Signature Verification**: Every simulated webhook is signed with an HMAC-SHA256 signature using the `WEBHOOK_SECRET`, exactly as Stripe or Flutterwave would do.
- **Failure Handling**: Randomized failures include specific reasons (e.g., "Insufficient Float"), which triggers the **Compensating Ledger Entry** logic to reverse funds automatically.

### 3. User Experience & Auditability
- **Success Interaction**: Replaced abrupt redirects with an **Emerald Success Modal**, providing immediate reference confirmation.
- **Audit Log**: The **Status Audit Log** now updates in real-time as webhooks arrive, showing the full chain of custody from `initiated` → `processing` → `completed/failed`.
- **Financial Printing**: Implemented CSS Print Media queries and a dedicated receipt view, allowing users to generate professional PDF/paper proofs of any transaction.

---

## Production Transition: The 5 Critical Changes

Before deploying this prototype to handle real-world funds, the following 5 architectural changes are non-negotiable:

### 1. Implement the Transactional Outbox Pattern
*   **Why it matters**: Atomic consistency between the database and the outside world. Currently, if the app crashes after the DB `COMMIT` but before `submitToProvider()`, the user is debited but the payment is never sent.
*   **Implementation**: Instead of calling the provider in the API handler, insert a record into an `outbox_events` table within the *same* DB transaction as the debit. A dedicated background worker polls this table and retries submission with backoff.
*   **Failure mode prevented**: **"Ghost Debits"** — where money leaves the sender's account but never reaches its destination.

### 2. Automated Post-Settlement Reconciliation
*   **Why it matters**: Financial software must verify its own integrity. We cannot rely solely on the application logic being "bug-free."
*   **Implementation**: A service that runs hourly to verify two invariants:
    1.  `Account.balance == SUM(LedgerEntries.amount)`.
    2.  `SUM(Transaction_Debits) == SUM(Transaction_Credits) + Fees`.
    If any invariant fails, shoot a PagerDuty alert immediately and pause transfers.
*   **Failure mode prevented**: **"Logical Drift"** — undetected bugs where balances slowly drift from reality due to race conditions or precision errors.

### 3. KMS-backed Secrets & PII Encryption
*   **Why it matters**: `.env` files are insecure. If an attacker gains server access, they have the keys to the kingdom. Additionally, recipient PII (emails/names) should be encrypted at rest.
*   **Implementation**: Integrate with **AWS KMS** or **HashiCorp Vault**. Use Envelope Encryption to encrypt the `WEBHOOK_SECRET` and sensitive recipient fields. Keys never touch the disk in plaintext.
*   **Failure mode prevented**: **"Full System Compromise"** — data breaches where an attacker exfiltrates the database or environment variables.

### 4. Global Distributed Locking (Redis/Redlock)
*   **Why it matters**: Database row-level locks are great but can lead to high contention and `ConnectionTimeout` errors under heavy load. Furthermore, idempotency keys should be checked *before* a DB transaction is even opened to save resources.
*   **Implementation**: Use **Redis (Redlock)** to acquire a lock on the `Idempotency-Key` at the middleware layer. If the lock is held, reject the request immediately. This moves the "wait" from the DB to an in-memory store.
*   **Failure mode prevented**: **"Double-Spend Race Conditions"** — where two identical requests bypass the initial DB check by hitting different nodes at the exact same millisecond.

### 5. Multi-Provider Routing & Circuit Breaking
*   **Why it matters**: Downstream payment providers (gateways) fail frequently. Depending on a single provider creates a single point of failure for the entire business.
*   **Implementation**: Implement a "Smart Router" with **Circuit Breakers** (e.g., using a library like `Hystrix` or `Resilience4j` logic). If Provider A returns 5xx or times out 3 times, the system automatically redirects NGN traffic to Provider B.
*   **Failure mode prevented**: **"Partner-Induced Downtime"** — where your system is perfectly healthy but can't process payments because a vendor is down.

---

## Evaluation Self-Assessment

### 💸 Financial Soundness
*   **Movements**: This prototype uses a **Double-Entry Ledger**. No balance is updated without a corresponding ledger entry record. Reversals are handled as compensating credits, not "undos."
*   **Data Model**: The use of `balance_before` and `balance_after` in the ledger ensures a perfect audit trail. Foreign keys and `NOT NULL` constraints protect data integrity at the storage layer.

### 🛠️ Error Handling & Correctness
*   **Failure Modes**: We handle provider timeouts by triggering automatic reversals. We handle idempotency to prevent double-charges. We handle signature verification to prevent spoofed callbacks.
*   **Pessimistic Locking**: Every transaction starts by acquiring a row-level lock on the sender account (`SELECT ... FOR UPDATE`), preventing the classic race condition of multiple simultaneous spending.

### 🛡️ Security & Ops
*   **Correctness**: The system enforces **Idempotency** at the API level and **Integrity** at the Database level.
*   **Ops Ready**: The dashboard includes a **Status Audit Log** (Timeline) for every transaction, showing exactly who (API, Webhook, System) changed the status and when. The **Print Receipt** feature provides a regulator-ready proof of payment.
