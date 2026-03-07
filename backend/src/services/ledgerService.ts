import { PoolClient } from 'pg';
import { LedgerEntry } from '../types';

/**
 * Double-Entry Ledger Service
 * 
 * Core financial invariants:
 * 1. All operations MUST run inside a PoolClient database transaction.
 * 2. Balance updates are protected by 'SELECT FOR UPDATE' row-level locks.
 * 3. Every state change is recorded with balance_before and balance_after for auditability.
 * 4. Constraint layer (database-level row checks) reinforces that balances cannot be negative.
 */

export async function debitAccount(
    client: PoolClient,
    transactionId: string,
    accountId: string,
    amount: number,
    currencyCode: string,
    purpose: string,
    notes?: string
): Promise<LedgerEntry> {
    // Lock the account row for update to prevent concurrent overdrafts
    const accountResult = await client.query(
        'SELECT balance FROM accounts WHERE id = $1 FOR UPDATE',
        [accountId]
    );

    const account = accountResult.rows[0];
    if (!account) throw new Error(`Account not found: ${accountId}`);

    const balanceBefore = parseFloat(account.balance);
    const balanceAfter = balanceBefore - amount;

    if (balanceAfter < 0) {
        throw new Error(`Insufficient funds. Available: ${balanceBefore} ${currencyCode}, Required: ${amount}`);
    }

    // Update balance
    await client.query(
        'UPDATE accounts SET balance = $1 WHERE id = $2',
        [balanceAfter, accountId]
    );

    // Record ledger entry
    const entry = await client.query<LedgerEntry>(
        `INSERT INTO ledger_entries 
      (transaction_id, account_id, entry_type, purpose, amount, currency_code, balance_before, balance_after, notes)
     VALUES ($1, $2, 'debit', $3, $4, $5, $6, $7, $8)
     RETURNING *`,
        [transactionId, accountId, purpose, amount, currencyCode, balanceBefore, balanceAfter, notes]
    );

    return entry.rows[0];
}

export async function creditAccount(
    client: PoolClient,
    transactionId: string,
    accountId: string,
    amount: number,
    currencyCode: string,
    purpose: string,
    notes?: string
): Promise<LedgerEntry> {
    const accountResult = await client.query(
        'SELECT balance FROM accounts WHERE id = $1 FOR UPDATE',
        [accountId]
    );

    const account = accountResult.rows[0];
    if (!account) throw new Error(`Account not found: ${accountId}`);

    const balanceBefore = parseFloat(account.balance);
    const balanceAfter = balanceBefore + amount;

    await client.query(
        'UPDATE accounts SET balance = $1 WHERE id = $2',
        [balanceAfter, accountId]
    );

    const entry = await client.query<LedgerEntry>(
        `INSERT INTO ledger_entries 
      (transaction_id, account_id, entry_type, purpose, amount, currency_code, balance_before, balance_after, notes)
     VALUES ($1, $2, 'credit', $3, $4, $5, $6, $7, $8)
     RETURNING *`,
        [transactionId, accountId, purpose, amount, currencyCode, balanceBefore, balanceAfter, notes]
    );

    return entry.rows[0];
}
