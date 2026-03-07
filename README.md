# PayRoute | Cross-Border Payment Bridge

A secure, idempotent cross-border payment processing service built for Nigerian businesses to pay international suppliers.

## Tech Stack
- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL 15 (Double-entry Ledger)
- **Frontend**: React + Vite + TanStack Query + Tailwind CSS
- **Infrastructure**: Docker + Docker Compose

## Quick Start

### 1. Prerequisites
- Docker & Docker Compose installed

### 2. Run the System
```bash
docker-compose up --build
```

### 3. Access
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3001](http://localhost:3001)

## Key Features
- **Double-Entry Ledger**: Full auditability with no room for balance drift.
- **Strict Idempotency**: Prevents duplicate payments under network retries.
- **FX Quote TTL**: Protects against market volatility with expiring quotes.
- **Webhook Safety**: Raw event logging + signature verification + atomic processing.

## Testing the Webhook
You can simulate a provider callback using `curl`:
```bash
# Get a transaction's provider_reference from the dashboard first
curl -X POST http://localhost:3001/webhooks/provider \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: [valid_hmac]" \
  -d '{
    "event_id": "evt_123",
    "reference": "PRV-XXXX-XXXX",
    "status": "completed",
    "message": "Payment successful"
  }'
```
*Note: In development, signature verification logs the error but proceeds for demonstration unless strict mode is enabled.*

## Analysis Document
See [ANALYSIS.md](./ANALYSIS.md) for a deep dive into the design decisions, schema integrity, and failure handling.
