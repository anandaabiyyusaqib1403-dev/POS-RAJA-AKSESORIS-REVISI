# Backend Integration Guide - Reset Routes

## Quick Setup

Add the reset routes to your Express server in 2 simple steps.

---

## Step 1: Add Import

At the top of `backend/server.js`, add:

```javascript
import resetRoutes from "./routes/reset.js";
```

Place it with your other route imports:

```javascript
import express from "express";
import productsRouter from "./routes/products.js";
import transactionsRouter from "./routes/transactions.js";
import resetRoutes from "./routes/reset.js";  // ← ADD THIS
```

---

## Step 2: Register Routes

In your Express app setup, add this line with your other route registrations:

```javascript
// Register routes
app.use("/api/products", productsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/reset", resetRoutes);  // ← ADD THIS
```

Usually this is after all middleware setup and before `app.listen()`.

---

## Complete Example

Here's how it fits in context:

```javascript
import express from "express";
import productsRouter from "./routes/products.js";
import transactionsRouter from "./routes/transactions.js";
import resetRoutes from "./routes/reset.js";  // ← NEW

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Routes
app.use("/api/products", productsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/reset", resetRoutes);  // ← NEW

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## API Endpoints Available

Once integrated, you'll have:

### 1. POST /api/reset/production
Execute full production reset (owner only)

```bash
curl -X POST http://localhost:5000/api/reset/production \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "message": "✓ Sistem berhasil direset...",
  "deletedCount": 1234,
  "timestamp": "2026-04-18T10:30:00Z",
  "resetBy": "user_id"
}
```

### 2. POST /api/reset/validate
Validate reset (preview what will be deleted)

```bash
curl -X POST http://localhost:5000/api/reset/validate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "safe": true,
  "warnings": [],
  "counts": {
    "transactions": 150,
    "logs": 2300,
    "returns": 12,
    "users": 8,
    "affectedByReset": 2462
  }
}
```

---

## Testing

After integration, test the routes:

```bash
# Test validation endpoint
curl -X POST http://localhost:5000/api/reset/validate

# Test reset (requires auth and owner role)
curl -X POST http://localhost:5000/api/reset/production
```

You should see responses with data counts and status.

---

## Environment Variables Needed

The reset routes use these env vars from `.env`:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pos_system_db
```

Make sure these are set in your `.env` file.

---

## Authentication

Both endpoints require authentication. The routes check:

```javascript
// Must be authenticated
if (!req.user) return 401 Unauthorized

// Must be owner role
if (req.user.role !== "pemilik") return 403 Forbidden
```

Your authentication middleware should set `req.user` with:
- `req.user.id` - User ID
- `req.user.role` - User role (must be "pemilik")

---

## Database Configuration

The reset routes connect directly to MySQL. Ensure your database:

1. Has all required tables
2. Has the structure defined by migrations
3. Is running and accessible
4. Has proper permissions for DELETE operations

Required tables:
- `transactions`
- `transaction_items`
- `services_transactions`
- `returns`
- `return_items`
- `logs`
- `activity_logs`
- `wallets`
- `users`

---

## Troubleshooting

### Routes Not Found (404)

Check:
- ✓ Reset routes imported
- ✓ Routes registered with `app.use()`
- ✓ Server restarted after changes
- ✓ Correct route path `/api/reset`

### 403 Forbidden

Check:
- ✓ User is authenticated
- ✓ User role is "pemilik"
- ✓ Auth middleware is working
- ✓ Token/session is valid

### Database Connection Error

Check:
- ✓ MySQL server is running
- ✓ .env variables are correct
- ✓ Database exists
- ✓ User has permission to delete

### 500 Server Error

Check:
- ✓ Database connection working
- ✓ All tables exist
- ✓ Foreign key constraints not blocking deletion
- ✓ Server logs for detailed error

---

## That's It!

Your backend is now ready for production resets. The AdminPanel component in the frontend will automatically work with these new endpoints.

Frontend flow:
1. Owner clicks "🔴 Reset Sistem" button
2. Modal opens with warnings
3. Owner types "RESET" confirmation
4. Frontend calls POST /api/reset/production
5. Backend clears all data
6. Frontend reloads page
7. System is ready for production
