import { Router, Request, Response } from 'express';
import { pool } from '../config/database';

const router = Router();

// GET /accounts - List accounts (for form dropdowns)
router.get('/', async (_req: Request, res: Response) => {
    try {
        const result = await pool.query(
            'SELECT id, owner_name, owner_email, currency_code, balance FROM accounts WHERE is_active = TRUE ORDER BY owner_name'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
