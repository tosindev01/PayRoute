import { pool } from '../config/database';
import { Transaction, TransactionStatus, VALID_TRANSITIONS } from '../types';
import { createFxQuote, lockQuote } from './fxService';
import { debitAccount, creditAccount } from './ledgerService';
import { submitToProvider } from './providerService';
import { simulateWebhookCallback } from './simulationService';

export interface InitiatePaymentParams {
    idempotencyKey: string;
    senderAccountId: string;
    recipientAccountId: string;
    sourceAmount: number;
    sourceCurrency: string;
    destCurrency: string;
    recipientDetails?: Record<string, unknown>;
}

export async function initiatePayment(params: InitiatePaymentParams): Promise<Transaction> {
    const {
        idempotencyKey,
        senderAccountId,
        recipientAccountId,
        sourceAmount,
        sourceCurrency,
        destCurrency,
    } = params;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Lock sender account row immediately to prevent concurrent overdrafts
        const senderResult = await client.query(
            'SELECT * FROM accounts WHERE id = $1 AND is_active = TRUE FOR UPDATE',
            [senderAccountId]
        );
        const sender = senderResult.rows[0];
        if (!sender) throw new Error('Sender account not found or inactive');
        if (sender.currency_code !== sourceCurrency) {
            throw new Error(`Account currency mismatch: account is ${sender.currency_code}, requested ${sourceCurrency}`);
        }
        if (parseFloat(sender.balance) < sourceAmount) {
            throw new Error(`Insufficient balance. Available: ${sender.balance} ${sourceCurrency}`);
        }

        // 2. Get FX quote and lock it atomically within this transaction
        const fxQuote = await createFxQuote(sourceCurrency, destCurrency, sourceAmount);
        const lockedQuote = await lockQuote(fxQuote.id);

        // 3. Create the transaction record
        const txnResult = await client.query<Transaction>(
            `INSERT INTO transactions 
        (sender_account_id, recipient_account_id, source_currency, dest_currency,
         source_amount, dest_amount, fee_amount, fx_rate, fx_quote_id, idempotency_key, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'initiated')
       RETURNING *`,
            [
                senderAccountId, recipientAccountId, sourceCurrency, destCurrency,
                sourceAmount, lockedQuote.dest_amount, lockedQuote.fee_amount,
                lockedQuote.rate, lockedQuote.id, idempotencyKey
            ]
        );
        const transaction = txnResult.rows[0];

        // 4. Double-entry debit — debit sender (within same DB transaction)
        await debitAccount(
            client, transaction.id, senderAccountId,
            sourceAmount, sourceCurrency, 'payment_debit',
            `Outgoing payment ${transaction.reference}`
        );

        // 5. Record status history
        await client.query(
            `INSERT INTO transaction_status_history (transaction_id, from_status, to_status, triggered_by)
       VALUES ($1, NULL, 'initiated', 'api')`,
            [transaction.id]
        );

        // 6. Move to processing state
        await client.query(
            `UPDATE transactions SET status = 'processing', processing_at = NOW() WHERE id = $1`,
            [transaction.id]
        );
        await client.query(
            `INSERT INTO transaction_status_history (transaction_id, from_status, to_status, triggered_by)
       VALUES ($1, 'initiated', 'processing', 'api')`,
            [transaction.id]
        );

        // 7. Commit everything BEFORE calling external provider
        // This ensures our ledger is consistent even if provider call fails
        await client.query('COMMIT');

        // 8. Submit to provider (outside DB transaction — failure here triggers reconciliation)
        let providerRef: string;
        try {
            const providerResult = await submitToProvider(
                transaction.id, sourceAmount, sourceCurrency, destCurrency, {}
            );
            providerRef = providerResult.provider_reference;
        } catch (providerError) {
            // Provider call failed — mark as failed and reverse the debit
            // This runs as a separate transaction
            await reverseTransaction(transaction.id, 'Provider submission failed');
            throw new Error(`Payment submission failed: ${(providerError as Error).message}`);
        }

        // 9. Update with provider reference
        const finalResult = await pool.query<Transaction>(
            'UPDATE transactions SET provider_reference = $1 WHERE id = $2 RETURNING *',
            [providerRef, transaction.id]
        );

        // 10. Simulate the asynchronous webhook callback 
        // In a real system, this would happen minutes/hours later from the actual provider
        simulateWebhookCallback(providerRef).catch(console.error);

        return finalResult.rows[0];

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function reverseTransaction(transactionId: string, reason: string): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const txnResult = await client.query<Transaction>(
            'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
            [transactionId]
        );
        const txn = txnResult.rows[0];
        if (!txn) throw new Error('Transaction not found');

        const currentStatus = txn.status as TransactionStatus;
        if (!VALID_TRANSITIONS[currentStatus].includes('reversed')) {
            throw new Error(`Cannot reverse transaction in status: ${currentStatus}`);
        }

        // Compensating credit — returns funds to sender
        await creditAccount(
            client, transactionId, txn.sender_account_id,
            parseFloat(txn.source_amount as unknown as string),
            txn.source_currency, 'reversal_credit',
            `Reversal: ${reason}`
        );

        const newStatus: TransactionStatus = 'reversed';
        await client.query(
            `UPDATE transactions SET status = $1, reversed_at = NOW() WHERE id = $2`,
            [newStatus, transactionId]
        );

        await client.query(
            `INSERT INTO transaction_status_history (transaction_id, from_status, to_status, reason, triggered_by)
       VALUES ($1, $2, $3, $4, 'system')`,
            [transactionId, currentStatus, newStatus, reason]
        );

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function transitionTransactionStatus(
    transactionId: string,
    newStatus: TransactionStatus,
    triggeredBy: string,
    reason?: string
): Promise<Transaction> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const txnResult = await client.query<Transaction>(
            'SELECT * FROM transactions WHERE id = $1 FOR UPDATE',
            [transactionId]
        );
        const txn = txnResult.rows[0];
        if (!txn) throw new Error('Transaction not found');

        const currentStatus = txn.status as TransactionStatus;
        if (!VALID_TRANSITIONS[currentStatus].includes(newStatus)) {
            throw new Error(`Invalid transition: ${currentStatus} → ${newStatus}`);
        }

        const timestampField: Record<string, string> = {
            initiated: 'initiated_at',
            completed: 'completed_at',
            failed: 'failed_at',
            reversed: 'reversed_at',
            processing: 'processing_at',
        };
        const fieldName = timestampField[newStatus];

        await client.query(
            `UPDATE transactions SET status = $1 ${fieldName ? `, ${fieldName} = NOW()` : ''} WHERE id = $2`,
            [newStatus, transactionId]
        );

        await client.query(
            `INSERT INTO transaction_status_history (transaction_id, from_status, to_status, reason, triggered_by)
       VALUES ($1, $2, $3, $4, $5)`,
            [transactionId, currentStatus, newStatus, reason, triggeredBy]
        );

        await client.query('COMMIT');

        const updated = await pool.query<Transaction>('SELECT * FROM transactions WHERE id = $1', [transactionId]);
        return updated.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
