# OkumuTraders API

MERN backend with Paystack deposits (M-Pesa + card), weekly withdrawals, trading, and Socket.IO live feed.

## Paystack (from LavernAI)

| Route | Auth | Description |
|-------|------|-------------|
| `GET /api/payments/paystack/public-key` | No | Frontend Paystack inline |
| `POST /api/payments/paystack/mpesa` | Yes | STK push (min **KES 200**) |
| `POST /api/payments/paystack/initialize` | Yes | Card checkout |
| `GET /api/payments/paystack/verify/:reference` | Yes | Verify + credit wallet |
| `POST /api/payments/paystack/webhook` | Paystack signature | `charge.success` credits wallet |
| `GET /api/payments/paystack/callback` | No | Redirect after card pay |

Withdrawals: `POST /api/transactions/withdrawal/request` — min **KES 500**, one request per **7 days**.

## Env

Copy `.env.example` → `.env`. Set `PAYSTACK_CALLBACK_URL` to  
`https://YOUR-API.onrender.com/api/payments/paystack/callback`  
and webhook URL in Paystack dashboard to  
`https://YOUR-API.onrender.com/api/payments/paystack/webhook`.

## Run

```bash
npm install
npm run dev
```
