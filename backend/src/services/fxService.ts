import { pool } from '../config/database';
import { FxQuote } from '../types';

// Simulated FX rates — in production this calls a real provider (e.g. Open Exchange Rates)
const SIMULATED_RATES: Record<string, number> = {
    'NGN_USD': 0.00065,  // 1 NGN = 0.00065 USD (approx ₦1538/USD)
    'NGN_GBP': 0.00052,
    'NGN_EUR': 0.00060,
    'NGN_CNY': 0.00471,
    'NGN_AED': 0.00239,
    'USD_NGN': 1538.46,
    'GBP_NGN': 1923.08,
    'EUR_NGN': 1666.67,
};

const FEE_RATE = 0.005; // 0.5% fee
const QUOTE_TTL_SECONDS = 300; // 5 minutes

export async function createFxQuote(
    sourceCurrency: string,
    destCurrency: string,
    sourceAmount: number
): Promise<FxQuote> {
    const pairKey = `${sourceCurrency}_${destCurrency}`;
    const rate = SIMULATED_RATES[pairKey];

    if (!rate) {
        throw new Error(`Unsupported currency pair: ${sourceCurrency} → ${destCurrency}`);
    }

    const feeAmount = sourceAmount * FEE_RATE;
    const netSourceAmount = sourceAmount - feeAmount;
    const destAmount = netSourceAmount * rate;
    const inverseRate = 1 / rate;
    const expiresAt = new Date(Date.now() + QUOTE_TTL_SECONDS * 1000);

    const result = await pool.query<FxQuote>(
        `INSERT INTO fx_quotes 
      (source_currency, dest_currency, rate, inverse_rate, source_amount, dest_amount, fee_amount, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
        [sourceCurrency, destCurrency, rate, inverseRate, sourceAmount, destAmount, feeAmount, expiresAt]
    );

    return result.rows[0];
}

export async function lockQuote(quoteId: string): Promise<FxQuote> {
    const result = await pool.query<FxQuote>(
        `UPDATE fx_quotes SET used_at = NOW() 
     WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING *`,
        [quoteId]
    );

    if (!result.rows[0]) {
        throw new Error('FX quote has expired or already been used. Please request a new quote.');
    }
    return result.rows[0];
}
