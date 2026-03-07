import { Router, Request, Response } from 'express';
import { createFxQuote } from '../services/fxService';

const router = Router();

// GET /fx/rates - Get simulated live rates for common pairs
router.get('/rates', async (_req: Request, res: Response) => {
    try {
        const currencies = ['USD', 'GBP', 'EUR', 'CNY', 'AED'];
        const rates = await Promise.all(
            currencies.map(async (curr) => {
                const quote = await createFxQuote('NGN', curr, 1000);
                return {
                    pair: `NGN/${curr}`,
                    rate: quote.rate,
                    trend: Math.random() > 0.5 ? 'up' : 'down',
                    change: (Math.random() * 0.05).toFixed(4)
                };
            })
        );
        res.json(rates);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
