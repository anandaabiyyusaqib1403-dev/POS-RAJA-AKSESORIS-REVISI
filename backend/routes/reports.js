import { Router } from 'express';

const router = Router();

router.use((req, res, next) => {
  const pool = req.app.get('dbPool');
  if (!pool) return res.status(500).json({ error: 'DB not initialized' });
  req.db = pool;
  next();
});

router.get('/', async (req, res) => {
  try {
    const [[transactionSummary]] = await req.db.execute(`
      SELECT
        COUNT(*) AS total_transactions,
        COALESCE(SUM(total), 0) AS total_revenue
      FROM transactions
    `);
    const [[productSummary]] = await req.db.execute(`
      SELECT
        COUNT(*) AS total_products,
        COALESCE(SUM(stock), 0) AS total_stock
      FROM products
    `);
    const [[walletSummary]] = await req.db.execute(`
      SELECT
        COUNT(*) AS total_wallets,
        COALESCE(SUM(balance), 0) AS total_wallet_balance
      FROM wallets
    `);

    res.json({
      products: productSummary,
      transactions: transactionSummary,
      wallets: walletSummary,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const [rows] = await req.db.execute(`
      SELECT
        DATE(date) AS transaction_date,
        COUNT(*) AS total_transactions,
        COALESCE(SUM(total), 0) AS total_revenue
      FROM transactions
      GROUP BY DATE(date)
      ORDER BY transaction_date DESC
      LIMIT 30
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
