-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================
-- CURRENCIES
-- =====================
CREATE TABLE currencies (
  code        VARCHAR(3) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  decimals    INT NOT NULL DEFAULT 2,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- ACCOUNTS
-- =====================
CREATE TABLE accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name    VARCHAR(255) NOT NULL,
  owner_email   VARCHAR(255) UNIQUE NOT NULL,
  currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
  balance       NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  locked_balance NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_owner_email ON accounts(owner_email);
CREATE INDEX idx_accounts_currency ON accounts(currency_code);

-- =====================
-- FX QUOTES
-- =====================
CREATE TABLE fx_quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_currency   VARCHAR(3) NOT NULL REFERENCES currencies(code),
  dest_currency     VARCHAR(3) NOT NULL REFERENCES currencies(code),
  rate              NUMERIC(20, 10) NOT NULL,
  inverse_rate      NUMERIC(20, 10) NOT NULL,
  source_amount     NUMERIC(20, 6) NOT NULL,
  dest_amount       NUMERIC(20, 6) NOT NULL,
  fee_amount        NUMERIC(20, 6) NOT NULL DEFAULT 0,
  expires_at        TIMESTAMPTZ NOT NULL,
  used_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fx_quotes_expires ON fx_quotes(expires_at);

-- =====================
-- TRANSACTIONS
-- =====================
CREATE TYPE transaction_status AS ENUM (
  'initiated',
  'processing',
  'completed',
  'failed',
  'reversed'
);

CREATE TABLE transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             VARCHAR(64) UNIQUE NOT NULL DEFAULT 'TXN-' || upper(substr(gen_random_uuid()::text, 1, 8)),
  sender_account_id     UUID NOT NULL REFERENCES accounts(id),
  recipient_account_id  UUID NOT NULL REFERENCES accounts(id),
  source_currency       VARCHAR(3) NOT NULL REFERENCES currencies(code),
  dest_currency         VARCHAR(3) NOT NULL REFERENCES currencies(code),
  source_amount         NUMERIC(20, 6) NOT NULL CHECK (source_amount > 0),
  dest_amount           NUMERIC(20, 6) NOT NULL CHECK (dest_amount > 0),
  fee_amount            NUMERIC(20, 6) NOT NULL DEFAULT 0,
  fx_rate               NUMERIC(20, 10) NOT NULL,
  fx_quote_id           UUID REFERENCES fx_quotes(id),
  status                transaction_status NOT NULL DEFAULT 'initiated',
  provider_reference    VARCHAR(255),
  idempotency_key       VARCHAR(255) UNIQUE NOT NULL,
  metadata              JSONB DEFAULT '{}',
  initiated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at         TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  reversed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_sender ON transactions(sender_account_id);
CREATE INDEX idx_transactions_recipient ON transactions(recipient_account_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX idx_transactions_provider_ref ON transactions(provider_reference);
CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key);

-- =====================
-- TRANSACTION STATUS HISTORY (Audit Timeline)
-- =====================
CREATE TABLE transaction_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  from_status     transaction_status,
  to_status       transaction_status NOT NULL,
  reason          TEXT,
  triggered_by    VARCHAR(50) NOT NULL, -- 'api', 'webhook', 'system'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_history_txn ON transaction_status_history(transaction_id, created_at);

-- =====================
-- LEDGER ENTRIES (Double-Entry Bookkeeping)
-- =====================
CREATE TYPE ledger_entry_type AS ENUM (
  'debit',
  'credit'
);

CREATE TYPE ledger_entry_purpose AS ENUM (
  'payment_debit',
  'payment_credit',
  'fee_debit',
  'reversal_credit',
  'reversal_debit',
  'lock',
  'unlock'
);

CREATE TABLE ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  account_id      UUID NOT NULL REFERENCES accounts(id),
  entry_type      ledger_entry_type NOT NULL,
  purpose         ledger_entry_purpose NOT NULL,
  amount          NUMERIC(20, 6) NOT NULL CHECK (amount > 0),
  currency_code   VARCHAR(3) NOT NULL REFERENCES currencies(code),
  balance_before  NUMERIC(20, 6) NOT NULL,
  balance_after   NUMERIC(20, 6) NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_account ON ledger_entries(account_id, created_at DESC);

-- =====================
-- IDEMPOTENCY KEYS
-- =====================
CREATE TABLE idempotency_keys (
  key             VARCHAR(255) PRIMARY KEY,
  request_hash    VARCHAR(64) NOT NULL,
  response_status INT NOT NULL,
  response_body   JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- =====================
-- WEBHOOK EVENTS (Raw Log)
-- =====================
CREATE TABLE webhook_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          VARCHAR(50) NOT NULL DEFAULT 'default',
  event_id          VARCHAR(255),
  raw_headers       JSONB NOT NULL,
  raw_body          TEXT NOT NULL,
  signature_valid   BOOLEAN NOT NULL,
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at      TIMESTAMPTZ,
  processing_error  TEXT,
  transaction_id    UUID REFERENCES transactions(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_transaction ON webhook_events(transaction_id);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed, created_at);

-- =====================
-- CONSTRAINT: Prevent invalid state transitions (enforced at app layer, documented here)
-- =====================
-- Valid transitions:
-- initiated -> processing
-- processing -> completed
-- processing -> failed
-- failed -> reversed
-- completed -> reversed (partial settlement scenario)

-- =====================
-- FUNCTION: auto-update updated_at
-- =====================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
