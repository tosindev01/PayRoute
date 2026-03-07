import { Router, Request, Response } from 'express';
import { pool } from '../config/database';
import { initiatePayment } from '../services/paymentService';
import { createFxQuote } from '../services/fxService';
import { idempotencyMiddleware } from '../middleware/idempotency';

const router = Router();

// GET /payments - Paginated list with filters
router.get('/', async (req: Request, res: Response) => {
    try {
        const { status, from, to } = req.query;
        const pageStr = req.query.page as string || '1';
        const limitStr = req.query.limit as string || '20';

        const pageNum = Math.max(1, parseInt(pageStr) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limitStr) || 20));
        const offset = (pageNum - 1) * limitNum;

        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (status && status !== 'all') {
            conditions.push(`t.status = $${paramIdx++}`);
            params.push(status);
        }
        if (from) {
            conditions.push(`t.created_at >= $${paramIdx++}`);
            params.push(from);
        }
        if (to) {
            conditions.push(`t.created_at <= $${paramIdx++}`);
            params.push(to);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM transactions t ${whereClause}`,
            params
        );

        const result = await pool.query(
            `SELECT 
        t.*,
        sa.owner_name as sender_name,
        ra.owner_name as recipient_name
       FROM transactions t
       JOIN accounts sa ON t.sender_account_id = sa.id
       JOIN accounts ra ON t.recipient_account_id = ra.id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
            [...params, limitNum, offset]
        );

        res.json({
            data: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum),
            }
        });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /payments/:id - Transaction detail with ledger entries and timeline
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const txnResult = await pool.query(
            `SELECT 
        t.*,
        sa.owner_name as sender_name, sa.owner_email as sender_email,
        ra.owner_name as recipient_name, ra.owner_email as recipient_email,
        fq.rate as quoted_rate, fq.expires_at as quote_expires_at
       FROM transactions t
       JOIN accounts sa ON t.sender_account_id = sa.id
       JOIN accounts ra ON t.recipient_account_id = ra.id
       LEFT JOIN fx_quotes fq ON t.fx_quote_id = fq.id
       WHERE t.id::text = $1 OR t.reference = $1`,
            [id]
        );

        if (!txnResult.rows[0]) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const transaction = txnResult.rows[0];

        const [ledgerResult, historyResult] = await Promise.all([
            pool.query(
                `SELECT le.*, a.owner_name as account_name
         FROM ledger_entries le
         JOIN accounts a ON le.account_id = a.id
         WHERE le.transaction_id = $1
         ORDER BY le.created_at ASC`,
                [transaction.id]
            ),
            pool.query(
                'SELECT * FROM transaction_status_history WHERE transaction_id = $1 ORDER BY created_at ASC',
                [transaction.id]
            )
        ]);

        res.json({
            ...transaction,
            ledger_entries: ledgerResult.rows,
            status_history: historyResult.rows,
        });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /payments - Initiate a new payment
router.post('/', idempotencyMiddleware(), async (req: Request, res: Response) => {
    try {
        const {
            sender_account_id,
            recipient_account_id,
            source_amount,
            source_currency,
            dest_currency,
            recipient_details,
        } = req.body;

        // Validate required fields
        if (!sender_account_id || !recipient_account_id || !source_amount || !source_currency || !dest_currency) {
            return res.status(400).json({
                error: 'sender_account_id, recipient_account_id, source_amount, source_currency, dest_currency are required'
            });
        }

        const idempotencyKey = (req as Request & { idempotencyKey: string }).idempotencyKey;

        const transaction = await initiatePayment({
            idempotencyKey,
            senderAccountId: sender_account_id,
            recipientAccountId: recipient_account_id,
            sourceAmount: parseFloat(source_amount),
            sourceCurrency: source_currency,
            destCurrency: dest_currency,
            recipientDetails: recipient_details,
        });

        res.status(201).json(transaction);
    } catch (error) {
        const message = (error as Error).message;
        if (message.includes('Insufficient') || message.includes('not found') || message.includes('mismatch')) {
            return res.status(422).json({ error: message });
        }
        res.status(500).json({ error: message });
    }
});

// POST /payments/quote - Get FX quote before initiating
router.post('/quote', async (req: Request, res: Response) => {
    try {
        const { source_currency, dest_currency, source_amount } = req.body;
        if (!source_currency || !dest_currency || !source_amount) {
            return res.status(400).json({ error: 'source_currency, dest_currency, and source_amount are required' });
        }
        const quote = await createFxQuote(source_currency, dest_currency, parseFloat(source_amount));
        res.json(quote);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

export default router;
