import { Router } from 'express';
import { body, validationResult } from 'express-validator';

const router = Router();

// Middleware to get DB pool
router.use((req, res, next) => {
  const pool = req.app.get('dbPool');
  if (!pool) return res.status(500).json({ error: 'DB not initialized' });
  req.db = pool;
  next();
});

// GET /api/products - Get all products
router.get('/', async (req, res) => {
  try {
    const [rows] = await req.db.execute(
      'SELECT * FROM products ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await req.db.execute(
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products - Create product
router.post('/',
  body('name').isLength({ min: 1 }).trim().escape(),
  body('category').isLength({ min: 1 }).trim().escape(),
  body('price').isFloat({ min: 0 }),
  body('modal').optional().isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { name, category, price, modal = 0, stock = 0 } = req.body;
      const [result] = await req.db.execute(
        'INSERT INTO products (name, category, price, modal, stock) VALUES (?, ?, ?, ?, ?)',
        [name, category, price, modal, stock]
      );
      const [newProduct] = await req.db.execute('SELECT * FROM products WHERE id = ?', [result.insertId]);
      res.status(201).json(newProduct[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PATCH /api/products/:id - Update
router.patch('/:id',
  body('name').optional().isLength({ min: 1 }).trim().escape(),
  body('category').optional().isLength({ min: 1 }).trim().escape(),
  body('price').optional().isFloat({ min: 0 }),
  body('modal').optional().isFloat({ min: 0 }),
  body('stock').optional().isInt({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const updates = [];
      const params = [];
      ['name', 'category', 'price', 'modal', 'stock'].forEach(field => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          params.push(req.body[field]);
        }
      });
      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

      params.push(req.params.id);
      await req.db.execute(`UPDATE products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
      const [updated] = await req.db.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);
      res.json(updated[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await req.db.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
