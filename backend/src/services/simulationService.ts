import axios from 'axios';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret-minimum-32-chars-long';
const PORT = process.env.PORT || 3001;

const FAILURE_REASONS = [
    'Insufficient funds in provider float',
    'Downstream bank timeout',
    'Fraud check vertical rejected',
    'Invalid recipient bank details',
    'Regulatory hold by intermediate bank'
];

/**
 * Simulates a provider calling back our webhook after a transaction is processed.
 * Randomizes outcomes to test "perfect" system handling of failures and completions.
 */
export async function simulateWebhookCallback(providerRef: string, forcedStatus?: 'completed' | 'failed') {
    // 1. Determine outcome
    const rand = Math.random();
    let status: 'completed' | 'failed' = forcedStatus || (rand > 0.15 ? 'completed' : 'failed');

    // 2. Determine delay (10-40 seconds)
    const delay = 10000 + Math.random() * 30000;

    const reason = status === 'failed'
        ? FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)]
        : 'Transaction processed successfully';

    console.log(`[SIMULATION] Will trigger ${status.toUpperCase()} webhook for ${providerRef} in ${Math.round(delay / 1000)}s. Reason: ${reason}`);

    setTimeout(async () => {
        try {
            const payload = {
                event_id: `evt_${Math.random().toString(36).slice(2)}`,
                reference: providerRef,
                status: status,
                message: reason,
                reason: reason // Some providers might use 'reason' instead of 'message'
            };

            const body = JSON.stringify(payload);
            const signature = crypto
                .createHmac('sha256', WEBHOOK_SECRET)
                .update(body)
                .digest('hex');

            await axios.post(`http://localhost:${PORT}/webhooks/provider`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-webhook-signature': signature
                }
            });
            console.log(`[SIMULATION] Webhook triggered for ${providerRef} with status ${status}`);
        } catch (error) {
            console.error(`[SIMULATION] Failed to trigger webhook:`, (error as Error).message);
        }
    }, delay);
}
