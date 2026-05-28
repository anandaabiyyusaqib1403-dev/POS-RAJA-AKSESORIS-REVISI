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
    const [rows] = await req.db.execute(
      'SELECT * FROM wallets ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const [rows] = await req.db.execute(`
      SELECT
        COUNT(*) AS total_wallets,
        COALESCE(SUM(balance), 0) AS total_balance
      FROM wallets
    `);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
