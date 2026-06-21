import { Router } from 'express';
import { body, validationResult } from 'express-validator';

const router = Router();

router.use((req, res, next) => {
  const pool = req.app.get('dbPool');
  if (!pool) return res.status(500).json({ error: 'DB not initialized' });
  req.db = pool;
  next();
});

// GET /api/transactions - List
router.get('/', async (req, res) => {
  try {
    const [rows] = await req.db.execute(`
      SELECT t.*,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT('product_name', ti.product_name, 'qty', ti.qty, 'price', ti.price)) FROM transaction_items ti WHERE ti.transaction_id = t.id) as items
      FROM transactions t
      ORDER BY date DESC LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await req.db.execute(
      'SELECT * FROM transactions WHERE id = ?', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions - Create transaction + items
router.post('/',
  body('type').isIn(['aksesoris', 'digital', 'logistik']),
  body('total').isFloat({ min: 0 }),
  body('method').isLength({ min: 1 }),
  body('cashier').optional().isLength({ min: 1 }),
  body('items').isArray({ min: 1 }).optional(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const connection = await req.db.getConnection();
    try {
      await connection.beginTransaction();

      const { type, total, method, cashier, items = [] } = req.body;
      const [result] = await connection.execute(
        'INSERT INTO transactions (type, total, method, cashier) VALUES (?, ?, ?, ?)',
        [type, total, method, cashier]
      );
      const transactionId = result.insertId;

      // Add items
      for (const item of items) {
        await connection.execute(
          'INSERT INTO transaction_items (transaction_id, product_name, qty, price) VALUES (?, ?, ?, ?)',
          [transactionId, item.product_name, item.qty, item.price]
        );
      }

      await connection.commit();

      const [transaction] = await req.db.execute(`
        SELECT t.*,
               (SELECT JSON_ARRAYAGG(JSON_OBJECT('product_name', ti.product_name, 'qty', ti.qty, 'price', ti.price)) FROM transaction_items ti WHERE ti.transaction_id = t.id) as items
        FROM transactions t WHERE t.id = ?
      `, [transactionId]);

      res.status(201).json(transaction[0]);
    } catch (err) {
      await connection.rollback();
      res.status(500).json({ error: err.message });
    } finally {
      connection.release();
    }
  }
);

export default router;
