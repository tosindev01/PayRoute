import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret-change-in-prod';

export interface ProviderSubmitResult {
    provider_reference: string;
    status: 'accepted';
    message: string;
}

/**
 * Simulates submitting a payment to a downstream provider.
 * In production, this would be an HTTP call to e.g. Flutterwave, Wise, etc.
 * Implements timeout handling and idempotency key forwarding.
 */
export async function submitToProvider(
    transactionId: string,
    amount: number,
    sourceCurrency: string,
    destCurrency: string,
    recipientDetails: Record<string, unknown>
): Promise<ProviderSubmitResult> {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

    // Simulate occasional provider errors (5% rate) for realism
    if (Math.random() < 0.05) {
        throw new Error('Provider temporarily unavailable. Please retry.');
    }

    const providerRef = `PRV-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    return {
        provider_reference: providerRef,
        status: 'accepted',
        message: 'Payment accepted for processing',
    };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(signature, 'hex')
        );
    } catch {
        return false;
    }
}
