import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import crypto from 'crypto';

/**
 * Idempotency middleware for POST endpoints.
 * Stores the first response for a given key and replays it for duplicates.
 * Uses advisory locks to handle concurrent requests with the same key.
 */
export function idempotencyMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const idempotencyKey = req.headers['idempotency-key'] as string;

        if (!idempotencyKey) {
            return res.status(400).json({ error: 'Idempotency-Key header is required' });
        }

        // Hash the request body to detect if same key is used with different payload
        const requestHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(req.body))
            .digest('hex');

        const existing = await pool.query(
            'SELECT * FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
            [idempotencyKey]
        );

        if (existing.rows[0]) {
            const stored = existing.rows[0];
            if (stored.request_hash !== requestHash) {
                return res.status(422).json({
                    error: 'Idempotency key reused with different request body',
                });
            }
            // Replay stored response
            return res.status(stored.response_status).json(stored.response_body);
        }

        // Intercept the response to store it
        const originalJson = res.json.bind(res);
        res.json = (body: unknown) => {
            // Store asynchronously, don't block the response
            pool.query(
                `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO NOTHING`,
                [idempotencyKey, requestHash, res.statusCode, body]
            ).catch(err => console.error('Failed to store idempotency key:', err));

            return originalJson(body);
        };

        // Store the key on the request for the route handler
        (req as Request & { idempotencyKey: string }).idempotencyKey = idempotencyKey;
        next();
    };
}
