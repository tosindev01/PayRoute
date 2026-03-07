import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pool } from './config/database';
import paymentsRouter from './routes/payments';
import webhooksRouter from './routes/webhooks';
import accountsRouter from './routes/accounts';
import fxRouter from './routes/fx';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));

app.use(express.json({
    verify: (req: any, _res, buf) => {
        if (req.originalUrl.startsWith('/webhooks')) {
            req.rawBody = buf.toString();
        }
    }
}));

// Health check
app.get('/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch {
        res.status(503).json({ status: 'degraded' });
    }
});

app.use('/payments', paymentsRouter);
app.use('/webhooks', webhooksRouter);
app.use('/accounts', accountsRouter);
app.use('/fx', fxRouter);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

// Run migrations on startup
async function runMigrations() {
    const fs = await import('fs');
    const path = await import('path');
    const migrationDir = path.join(__dirname, 'db/migrations');

    // Ensure we are reading from the right place depending on development vs production
    const targetDir = fs.existsSync(migrationDir) ? migrationDir : path.join(process.cwd(), 'src/db/migrations');

    if (!fs.existsSync(targetDir)) {
        console.warn('Migration directory not found:', targetDir);
        return;
    }

    const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.sql')).sort();

    await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

    for (const file of files) {
        const applied = await pool.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
        if (!applied.rows.length) {
            const sql = fs.readFileSync(path.join(targetDir, file), 'utf-8');
            await pool.query(sql);
            await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
            console.log(`Applied migration: ${file}`);
        }
    }
}

runMigrations()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`PayRoute API running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
