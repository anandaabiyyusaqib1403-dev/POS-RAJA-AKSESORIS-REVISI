import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

import productsRoutes from './routes/products.js';
import employeesRoutes from './routes/employees.js';
import reportsRoutes from './routes/reports.js';
import resetRoutes from './routes/reset.js';
import transactionsRoutes from './routes/transactions.js';
import walletRoutes from './routes/wallet.js';
import whatsappRoutes from './routes/whatsapp.js';
import { requireAuthenticatedUser } from './server/requestSecurity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });

const app = express();
const PORT = process.env.PORT || 3001;
const legacyMysqlRoutesEnabled =
  process.env.NODE_ENV !== 'production' && process.env.ENABLE_LEGACY_MYSQL_ROUTES === 'true';
const configuredCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];
const allowLocalViteOrigins = configuredCorsOrigins.length === 0;
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (
      configuredCorsOrigins.includes(origin) ||
      (allowLocalViteOrigins && localOriginPattern.test(origin))
    ) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
};

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
};
const hasDbConfig =
  legacyMysqlRoutesEnabled && Boolean(dbConfig.host && dbConfig.user && dbConfig.database);
const dbPool = hasDbConfig ? mysql.createPool(dbConfig) : null;

if (dbPool) {
  app.set('dbPool', dbPool);
} else if (legacyMysqlRoutesEnabled) {
  console.warn('MySQL DB pool disabled: DB_HOST, DB_USER, and DB_NAME must be configured.');
} else {
  console.warn('Legacy MySQL POS routes disabled. Supabase RPC is the active data boundary.');
}

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/ping', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// Supabase is the POS source of truth. Legacy MySQL paths are local-only opt-ins.
if (legacyMysqlRoutesEnabled) {
  app.use('/api/products', requireAuthenticatedUser, productsRoutes);
  app.use('/api/transactions', requireAuthenticatedUser, transactionsRoutes);
  app.use('/api/wallet', requireAuthenticatedUser, walletRoutes);
  app.use('/api/reports', requireAuthenticatedUser, reportsRoutes);
} else {
  const legacyRouteDisabled = (_req, res) =>
    res.status(410).json({ error: 'Legacy MySQL route disabled. Use Supabase RPC workflows.' });
  app.use('/api/products', legacyRouteDisabled);
  app.use('/api/transactions', legacyRouteDisabled);
  app.use('/api/wallet', legacyRouteDisabled);
  app.use('/api/reports', legacyRouteDisabled);
}

app.use('/api/employees', employeesRoutes);
app.use('/api/reset', requireAuthenticatedUser, resetRoutes);
app.use('/api/whatsapp', requireAuthenticatedUser, whatsappRoutes);
app.post('/api/cron/health', (req, res) => {
  res.json({ ok: true, service: 'raja-aksesoris-integrations', timestamp: new Date().toISOString() });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Integration server running on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  if (dbPool) {
    await dbPool.end();
  }
  process.exit(0);
});

export default app;
