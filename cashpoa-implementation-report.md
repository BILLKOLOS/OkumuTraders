# CashPoa — Frontend Feature Analysis & Technical Implementation Report

## 1. Platform Identity

CashPoa (cashpoa.com) is a **binary/OTC trading platform** targeting Kenyan users.
Its core loop: deposit via M-Pesa → watch a live oscillating rate chart → place a BUY or SELL position → profit or loss is calculated against the entry rate.

**Regulatory footer:** Licensed in the Commonwealth of The Bahamas · Licence No BHA-0023-1873201

---

## 2. Comprehensive Frontend Feature Inventory

### 2.1 Login Screen (`/login.php`)

| Element | Detail |
|---|---|
| Logo | Green rounded-square icon ("C") + "Cash Poa" wordmark |
| Subtitle | "Sign in to your trading account" |
| Email/Phone field | Placeholder: `e.g. 254712345678` (254 prefix = Kenya) |
| Password field | Dotted/masked input |
| Sign In CTA | Full-width green button |
| Registration link | "Don't have an account? Sign Up" (green link) |
| Admin portal | Subtle "Admin portal →" text link |
| License footer | Bahamas regulatory disclosure |

### 2.2 Trade Screen (homepage `/`)

**Top bar:**
- Cash Poa logo + name
- Moon icon (dark mode toggle)
- Login button (outlined)
- Sign Up button (green filled)

**Rate header:**
- Large green number (e.g., `2.4477`)
- Percentage change badge (e.g., `+244.77%`) on green background

**Chart area:**
- Time interval selector: `30s`, `1m`, `2m`, `5m` (pill buttons)
- Active interval highlighted in green
- Y-axis labels: `3.0`, `1.5`, `0.0`, `-1.5`, `-3.0`
- Floating rate label: `Rate: 2.4477` in top-right corner of chart
- Real-time oscillating line chart (see Section 3)

**Trade panel (below chart):**
- KES amount input (editable)
- Quick-select chips: `50`, `100`, `200`, `500`
- AUTOSELL badge (circular, number = 10)
- P&L display: `P&L KES 0.00`
- BUY button (green, full-width left half)
- SELL button (red/pink, full-width right half)

**Bottom navigation bar:**
- TRADE (chart icon, active state = green)
- DEPOSIT (coin/arrow icon)
- HISTORY (list icon)
- PROFILE (person icon)

### 2.3 Deposit Modal

Triggered from DEPOSIT nav tab. Overlays the trade screen.

| Element | Detail |
|---|---|
| Title | "Deposit via M-Pesa" (green text, bag emoji) |
| Amount field | KES amount input (default: 500) |
| Phone field | M-Pesa number (format: 254XXXXXXXXX) |
| Primary CTA | "Send STK Push" (green full-width button) |
| Secondary CTA | "Cancel" (plain text button) |

---

## 3. The Live Trading Chart — Technical Deep Dive

This is the platform's most critical UI feature. Here's exactly how to implement it.

### 3.1 What It Is

The chart is a **real-time oscillating area chart** with:
- A continuous scrolling price line (green stroke)
- **Green gradient fill** for area above the zero baseline
- **Dark red gradient fill** for area below the zero baseline
- A live dot at the current price position
- A floating rate label
- Y-axis ranging from -3.0 to +3.0

### 3.2 Data Generation

The price signal is **synthetically generated** — it is NOT a real forex/crypto feed. It uses superimposed sine waves with noise to produce natural-looking oscillations:

```javascript
const Y_MIN = -3.0;
const Y_MAX = 3.0;
const N = 90; // rolling data window

function generatePoint(t) {
  return (
    Math.sin(t * 0.38) * 1.35  +   // slow wave (main trend)
    Math.sin(t * 1.15) * 0.55  +   // medium wave (rhythm)
    Math.sin(t * 2.9)  * 0.28  +   // fast wave (micro-jitter)
    (Math.random() - 0.5) * 0.22   // Gaussian noise
  );
}
```

**Why multiple sine waves?** Each operates at a different frequency, creating the irregular mountain-valley pattern visible in the screenshots. A single sine wave would look too predictable.

### 3.3 Rolling Window Update

```javascript
// Every 280-300ms:
tRef.current += 0.2;
const newPoint = generatePoint(tRef.current);

setChartData(prev => [...prev.slice(1), newPoint]);
// Drop oldest point, append newest → chart scrolls left
```

The time parameter `t` increments with each tick. Using `useRef` for `t` ensures it persists across re-renders without causing unnecessary effects.

### 3.4 SVG Rendering with Dual ClipPaths

The key technique is using two `<clipPath>` elements to split the single area path into green (above) and red (below) regions:

```jsx
const zeroY = ((Y_MAX - 0) / (Y_MAX - Y_MIN)) * chartHeight;

// Full area path (same for both fills)
const areaPath = `${linePath} L${lastX},${zeroY} L${firstX},${zeroY} Z`;

<defs>
  {/* Clips everything above the zero line */}
  <clipPath id="clip-above">
    <rect x="0" y="0" width={W} height={zeroY} />
  </clipPath>

  {/* Clips everything below the zero line */}
  <clipPath id="clip-below">
    <rect x="0" y={zeroY} width={W} height={H - zeroY} />
  </clipPath>

  <linearGradient id="grad-green" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"   stopColor="#1cd25e" stopOpacity="0.55" />
    <stop offset="100%" stopColor="#1cd25e" stopOpacity="0.03" />
  </linearGradient>

  <linearGradient id="grad-red" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"   stopColor="#ff2d55" stopOpacity="0.02" />
    <stop offset="100%" stopColor="#ff2d55" stopOpacity="0.45" />
  </linearGradient>
</defs>

{/* Green fill (above zero only) */}
<path d={areaPath} fill="url(#grad-green)" clipPath="url(#clip-above)" />

{/* Red fill (below zero only) */}
<path d={areaPath} fill="url(#grad-red)" clipPath="url(#clip-below)" />

{/* The price line itself */}
<path d={linePath} fill="none" stroke="#1cd25e" strokeWidth="2.2" />

{/* Live position dot + halo */}
<circle cx={lastX} cy={lastY} r="6"  fill="#1cd25e" />
<circle cx={lastX} cy={lastY} r="13" fill="#1cd25e" fillOpacity="0.18" />
```

**Why `preserveAspectRatio="none"` on the SVG?**
Using `viewBox="0 0 1000 280"` with `preserveAspectRatio="none"` lets the SVG stretch to fill its container exactly, making it responsive without any coordinate recalculation.

### 3.5 Coordinate Mapping

```javascript
// Map data index → x pixel
const toX = (i) => (i / (N - 1)) * W;

// Map price value → y pixel (y increases downward in SVG)
const toY = (v) => ((Y_MAX - v) / (Y_MAX - Y_MIN)) * H;

// Zero line y-coordinate
const zeroY = toY(0); // = (3.0 / 6.0) * H = 50% of chart height
```

### 3.6 Rate Display (Floating Label in Chart)

```jsx
<rect x={W - 182} y="10" width="172" height="34" rx="5" fill="#1a2d48" />
<text x={W - 96} y="33" textAnchor="middle" fill="white" 
      fontSize="17" fontFamily="monospace" fontWeight="700">
  Rate: {rate.toFixed(4)}
</text>
```

The rate itself is updated independently of the chart using a small random walk:

```javascript
setRate(prev => {
  const next = +(prev + (Math.random() - 0.48) * 0.0019).toFixed(4);
  return Math.min(5, Math.max(0.5, next)); // clamp to valid range
});
```

---

## 4. M-Pesa STK Push Flow

The deposit flow simulates Safaricom's **STK Push** (SIM Toolkit Push):

1. User enters KES amount + registered M-Pesa number (254XXXXXXXXX)
2. Clicks "Send STK Push"
3. Backend calls Safaricom Daraja API: `POST /mpesa/stkpush/v1/processrequest`
4. M-Pesa sends a PIN prompt to the user's phone
5. User enters PIN → M-Pesa confirms → backend webhook updates balance

**Real Daraja API payload:**
```json
{
  "BusinessShortCode": "174379",
  "Password": "<base64(shortcode+passkey+timestamp)>",
  "Timestamp": "20241101123456",
  "TransactionType": "CustomerPayBillOnline",
  "Amount": 500,
  "PartyA": "254712345678",
  "PartyB": "174379",
  "PhoneNumber": "254712345678",
  "CallBackURL": "https://cashpoa.com/api/mpesa/callback",
  "AccountReference": "CashPoa",
  "TransactionDesc": "Deposit"
}
```

---

## 5. P&L Calculation Logic

```javascript
// On every rate tick while a trade is active:
useEffect(() => {
  if (!activeTrade) { setPl(0); return; }
  const direction = activeTrade.type === "BUY" ? 1 : -1;
  const diff = (rate - activeTrade.entry) * direction;
  setPl(+(diff * activeTrade.amount * multiplier).toFixed(2));
}, [rate, activeTrade]);
```

- **BUY**: profits when rate rises above entry
- **SELL**: profits when rate falls below entry
- `multiplier` is a platform-set constant controlling payout ratio

---

## 6. State Architecture

```
App State
├── screen: "login" | "trade" | "history" | "profile"
├── showDeposit: boolean (modal overlay)
├── chartData: number[]          (rolling N-point window)
├── rate: number                 (current displayed rate)
├── activeTrade: null | { type, entry, amount }
├── pl: number                   (live P&L in KES)
├── trades: TradeRecord[]        (closed trade history)
└── notif: string | null         (toast notification)
```

---

## 7. Design System

| Token | Value |
|---|---|
| Background deep | `#07101f` |
| Card surface | `#0c1828` |
| Input surface | `#101f35` |
| Border | `#182c45` |
| Green (primary) | `#1cd25e` |
| Red (sell/loss) | `#ff2d55` |
| Text primary | `#ffffff` |
| Text muted | `#566a88` |
| Font | System sans-serif (SF Pro / Segoe UI) |

---

## 8. Performance Considerations

| Concern | Solution |
|---|---|
| Re-render cost of 90-point array update every 280ms | `setData(prev => [...prev.slice(1), v])` — single array mutation |
| SVG path string rebuild on every tick | Acceptable for 90 points; canvas would be needed for >500 |
| ClipPath IDs conflict | Use unique IDs or `useId()` hook if multiple charts exist |
| `setInterval` memory leak | Always `clearInterval` on `useEffect` cleanup |
| `t` reference across renders | `useRef` (not `useState`) to avoid stale closures |

---

## 9. Implementation Checklist

- [x] Dark theme with `#07101f` deep background
- [x] Green `#1cd25e` as sole primary accent
- [x] Red `#ff2d55` for SELL and negative P&L only
- [x] Oscillating chart with sine + noise generation
- [x] Dual clipPath green/red area fill technique
- [x] Rolling 90-point window with 280ms tick
- [x] Rate floating label inside SVG
- [x] Y-axis labels: 3.0 → -3.0
- [x] Time interval tabs (30s, 1m, 2m, 5m)
- [x] KES input + chip selectors (50, 100, 200, 500)
- [x] AUTOSELL badge
- [x] P&L live tracking
- [x] BUY/SELL → CLOSE toggle on active trade
- [x] M-Pesa deposit modal (STK Push)
- [x] Bottom navigation (TRADE, DEPOSIT, HISTORY, PROFILE)
- [x] Trade history log
- [x] Toast notifications
- [x] Bahamas licence footer

---

*Report generated from direct screenshot analysis of cashpoa.com (4 screens) and Kenyan fintech context.*
