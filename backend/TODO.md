# POS Raja Backend

REST API with Express + MySQL plus backend-only WhatsApp notifications.

## Setup

1. Copy `.env.example` to `.env`, fill DB creds if the MySQL routes are used.
2. Set `FONNTE_TOKEN` and `FONNTE_TARGETS` for WhatsApp shift notifications.
3. `npm install`
4. `npm run dev`

## Endpoints

- GET /ping
- /api/products (CRUD)
- /api/transactions, /api/wallet, /api/logistics, /api/reports
- /api/whatsapp/opening and /api/whatsapp/closing

Port: 3001
CORS: localhost:5173
