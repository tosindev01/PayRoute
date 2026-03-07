import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { verifyWebhookSignature } from '../services/providerService';
import { transitionTransactionStatus, reverseTransaction } from '../services/paymentService';
import { creditAccount } from '../services/ledgerService';
import { TransactionStatus, VALID_TRANSITIONS } from '../types';

const router = Router();

router.post('/provider', async (req: Request, res: Response) => {
    // ALWAYS return 200 immediately (after processing) to prevent provider retries
    // even for unknown transactions — provider shouldn't know our internal state

    const rawBody = (req as Request & { rawBody?: string }).rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-webhook-signature'] as string;
    const payload = req.body;

    // 1. Log the raw webhook event FIRST, before any processing
    let webhookEventId: string;
    try {
        const signatureValid = signature ? verifyWebhookSignature(rawBody, signature) : false;

        const eventResult = await pool.query(
            `INSERT INTO webhook_events 
        (provider, event_id, raw_headers, raw_body, signature_valid)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
            ['default', payload.event_id || null, req.headers, rawBody, signatureValid]
        );
        webhookEventId = eventResult.rows[0].id;

        // 2. Reject invalid signatures AFTER logging
        if (!signatureValid) {
            await pool.query(
                'UPDATE webhook_events SET processing_error = $1 WHERE id = $2',
                ['Invalid signature', webhookEventId]
            );
            // Still return 200 to not reveal internal state to potential attacker
            return res.status(200).json({ received: true });
        }
    } catch (logError) {
        console.error('Failed to log webhook:', logError);
        return res.status(200).json({ received: true });
    }

    // 3. Check for duplicate webhook (idempotency)
    if (payload.event_id) {
        const duplicate = await pool.query(
            `SELECT id FROM webhook_events 
       WHERE event_id = $1 AND processed = TRUE AND id != $2`,
            [payload.event_id, webhookEventId]
        );
        if (duplicate.rows.length > 0) {
            await pool.query(
                'UPDATE webhook_events SET processed = TRUE, processed_at = NOW() WHERE id = $1',
                [webhookEventId]
            );
            return res.status(200).json({ received: true, duplicate: true });
        }
    }

    // 4. Look up transaction
    const txnResult = await pool.query(
        'SELECT * FROM transactions WHERE provider_reference = $1',
        [payload.reference]
    );
    const transaction = txnResult.rows[0];

    if (!transaction) {
        // Unknown reference — log it and return 200
        // WHY 200: returning 4xx would cause providers to retry indefinitely
        // and could expose internal state. Log it for manual investigation.
        await pool.query(
            `UPDATE webhook_events SET processing_error = 'Unknown transaction reference', processed = TRUE, processed_at = NOW() WHERE id = $1`,
            [webhookEventId]
        );
        return res.status(200).json({ received: true });
    }

    await pool.query(
        'UPDATE webhook_events SET transaction_id = $1 WHERE id = $2',
        [transaction.id, webhookEventId]
    );

    // 5. Process status update
    try {
        const currentStatus = transaction.status as TransactionStatus;
        const incomingStatus = payload.status as TransactionStatus;

        if (!VALID_TRANSITIONS[currentStatus]?.includes(incomingStatus)) {
            // Invalid transition — don't process but don't error (idempotent handling)
            await pool.query(
                `UPDATE webhook_events SET processing_error = $1, processed = TRUE, processed_at = NOW() WHERE id = $2`,
                [`Invalid transition: ${currentStatus} → ${incomingStatus}`, webhookEventId]
            );
            return res.status(200).json({ received: true });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (incomingStatus === 'completed') {
                // Credit recipient account
                await creditAccount(
                    client,
                    transaction.id,
                    transaction.recipient_account_id,
                    parseFloat(transaction.dest_amount),
                    transaction.dest_currency,
                    'payment_credit',
                    `Incoming payment ${transaction.reference}`
                );

                await client.query(
                    `UPDATE transactions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                    [transaction.id]
                );
                await client.query(
                    `INSERT INTO transaction_status_history (transaction_id, from_status, to_status, triggered_by, reason)
           VALUES ($1, $2, 'completed', 'webhook', $3)`,
                    [transaction.id, currentStatus, `Provider confirmed: ${payload.message || 'completed'}`]
                );

            } else if (incomingStatus === 'failed') {
                // Reverse sender debit via compensating entry
                await creditAccount(
                    client,
                    transaction.id,
                    transaction.sender_account_id,
                    parseFloat(transaction.source_amount),
                    transaction.source_currency,
                    'reversal_credit',
                    `Payment failed: ${payload.reason || 'provider rejected'}`
                );

                await client.query(
                    `UPDATE transactions SET status = 'failed', failed_at = NOW() WHERE id = $1`,
                    [transaction.id]
                );
                await client.query(
                    `INSERT INTO transaction_status_history (transaction_id, from_status, to_status, triggered_by, reason)
           VALUES ($1, $2, 'failed', 'webhook', $3)`,
                    [transaction.id, currentStatus, payload.reason || 'Provider reported failure']
                );
            }

            await client.query(
                'UPDATE webhook_events SET processed = TRUE, processed_at = NOW() WHERE id = $1',
                [webhookEventId]
            );

            await client.query('COMMIT');
        } catch (processError) {
            await client.query('ROLLBACK');
            await pool.query(
                'UPDATE webhook_events SET processing_error = $1 WHERE id = $2',
                [(processError as Error).message, webhookEventId]
            );
            throw processError;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
        // Still return 200 — failure is logged, will be reconciled
        return res.status(200).json({ received: true, error: 'Processing error logged' });
    }

    res.status(200).json({ received: true });
});

export default router;
