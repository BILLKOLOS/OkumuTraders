import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import {
  MIN_DEPOSIT_KES,
  MIN_WITHDRAWAL_KES,
  initializeMpesa,
  pollUntilPaid,
  requestWithdrawal,
  getPublicKey,
  openPaystackCard,
  verifyPayment,
} from "../src/lib/paystack.js";

// ── Config ────────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

// ── Color palette (unchanged from original) ───────────────────────────────────
const C = {
  bg: "#07101f", card: "#0c1828", input: "#101f35", border: "#182c45",
  green: "#1cd25e", greenDim: "#071a0e", red: "#ff6b7a", yellow: "#f5c518",
  text: "#ffffff", muted: "#566a88", sub: "#334055", nav: "#0a1422",
  redBtn: "#ff2d55",
};

// ── Chart math (unchanged) ────────────────────────────────────────────────────
const Y_MIN = -3, Y_MAX = 3, N = 90, Y_LABELS = [3, 1.5, 0, -1.5, -3];
const genPt = (t) =>
  Math.sin(t * 0.38) * 1.35 + Math.sin(t * 1.15) * 0.55 +
  Math.sin(t * 2.9) * 0.28 + (Math.random() - 0.5) * 0.22;

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

// ── Format KES ────────────────────────────────────────────────────────────────
function fKES(n) {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `KES ${(n / 1_000).toFixed(1)}K`;
  return `KES ${n.toLocaleString()}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function LiveChart({ data, rate }) {
  const W = 1000, H = 260, yRange = Y_MAX - Y_MIN;
  const toX = (i) => (i / (data.length - 1)) * W;
  const toY = (v) => ((Y_MAX - v) / yRange) * H;
  if (data.length < 2) return null;
  const pts = data.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const last = pts[pts.length - 1], first = pts[0], zeroY = toY(0);
  const linePath = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${last.x.toFixed(1)},${zeroY.toFixed(1)} L${first.x.toFixed(1)},${zeroY.toFixed(1)} Z`;
  const zY = +zeroY.toFixed(1);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <clipPath id="ab"><rect x="0" y="0" width={W} height={zY} /></clipPath>
        <clipPath id="bl"><rect x="0" y={zY} width={W} height={H - zY} /></clipPath>
        <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1cd25e" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1cd25e" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff2d55" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#ff2d55" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <line x1="0" y1={zY} x2={W} y2={zY} stroke="#253a58" strokeWidth="1.5" />
      <path d={areaPath} fill="url(#gg)" clipPath="url(#ab)" />
      <path d={areaPath} fill="url(#rg)" clipPath="url(#bl)" />
      <path d={linePath} fill="none" stroke="#1cd25e" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="7" fill="#1cd25e" />
      <rect x={W - 190} y="10" width="180" height="36" rx="6" fill="#0f1f36" />
      <text x={W - 100} y="34" textAnchor="middle" fill="white" fontSize="18"
        fontFamily="monospace" fontWeight="800">Rate: {rate.toFixed(4)}</text>
    </svg>
  );
}

// ── Activity Feed (left sidebar on larger screens, bottom ticker on mobile) ───
function ActivityFeed({ items }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      overflow: "hidden", maxHeight: 340,
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
        fontSize: 11, fontWeight: 800, letterSpacing: 1, color: C.muted,
      }}>
        🔴 LIVE ACTIVITY
      </div>
      <div style={{ overflowY: "auto", maxHeight: 290 }}>
        {items.length === 0 ? (
          <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>Loading activity…</div>
        ) : (
          items.map((item, i) => (
            <div key={item.ts + i} style={{
              padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
              fontSize: 12, lineHeight: 1.5,
              color: item.type === "win" ? C.green : C.yellow,
              animation: i === 0 ? "fadeIn 0.4s ease" : "none",
            }}>
              {item.message}
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                {new Date(item.ts).toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Platform Stats Bar ────────────────────────────────────────────────────────
function StatsBar({ stats }) {
  const items = [
    { label: "24H VOLUME", value: fKES(stats.volume24h), color: C.green },
    { label: "TRADERS ONLINE", value: stats.tradersOnline?.toLocaleString(), color: C.yellow },
    { label: "TOTAL PAYOUTS", value: fKES(stats.totalPayouts), color: "#c084fc" },
    { label: "ACTIVE TRADES", value: stats.activeTrades?.toLocaleString(), color: C.green },
  ];
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
      gap: 8, padding: "10px 14px", background: "#060e1c",
      borderBottom: `1px solid ${C.border}`,
    }}>
      {items.map((s) => (
        <div key={s.label} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.muted }}>{s.label}</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: s.color, fontFamily: "monospace" }}>
            {s.value || "…"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Dashboard Header ──────────────────────────────────────────────────────────
function DepositModal({ open, onClose, user, token, notify, onBalanceUpdate }) {
  const [amount, setAmount] = useState(String(MIN_DEPOSIT_KES));
  const [phone, setPhone] = useState(() => {
    const p = user?.phoneNumber || "";
    if (p.startsWith("254")) return `0${p.slice(3)}`;
    return p;
  });
  const [step, setStep] = useState("form");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const payMpesa = async () => {
    const kes = Math.round(Number(amount));
    if (!kes || kes < MIN_DEPOSIT_KES) return notify(`Minimum deposit is KES ${MIN_DEPOSIT_KES}`);
    setBusy(true);
    setStep("processing");
    try {
      const { reference } = await initializeMpesa(kes, phone, user.email, token);
      const result = await pollUntilPaid(reference, token);
      onBalanceUpdate({ ...user, balance: result.newBalance });
      notify(`Deposited KES ${result.amount} ✓`);
      onClose();
    } catch (e) {
      notify(e.message);
      setStep("form");
    }
    setBusy(false);
  };

  const payCard = async () => {
    const kes = Math.round(Number(amount));
    if (!kes || kes < MIN_DEPOSIT_KES) return notify(`Minimum deposit is KES ${MIN_DEPOSIT_KES}`);
    setBusy(true);
    try {
      const pk = await getPublicKey(token);
      await openPaystackCard({
        publicKey: pk,
        email: user.email,
        amountKes: kes,
        token,
        onSuccess: async (ref) => {
          setStep("processing");
          const result = await pollUntilPaid(ref, token);
          onBalanceUpdate({ ...user, balance: result.newBalance });
          notify(`Deposited KES ${result.amount} ✓`);
          onClose();
        },
        onCancel: () => setBusy(false),
      });
    } catch (e) {
      notify(e.message);
    }
    setBusy(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div
        style={{
          background: C.card, borderRadius: "16px 16px 0 0", padding: 20,
          width: "100%", maxWidth: 420, border: `1px solid ${C.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 4px", fontWeight: 800 }}>Deposit (Paystack)</h3>
        <p style={{ color: C.muted, fontSize: 12, margin: "0 0 16px" }}>
          Minimum KES {MIN_DEPOSIT_KES} · M-Pesa or card
        </p>
        {step === "processing" ? (
          <div style={{ textAlign: "center", padding: 24, color: C.green }}>
            <div style={{ fontSize: 32 }}>📱</div>
            <p style={{ fontWeight: 700 }}>Check your phone or complete card payment…</p>
            <p style={{ fontSize: 12, color: C.muted }}>Confirming with Paystack</p>
          </div>
        ) : (
          <>
            <label style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>AMOUNT (KES)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={MIN_DEPOSIT_KES}
              style={{
                width: "100%", boxSizing: "border-box", margin: "6px 0 12px",
                background: C.input, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 12, color: C.text, fontSize: 18, fontWeight: 800,
              }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {[200, 500, 1000, 2000, 5000].map((n) => (
                <button key={n} type="button" onClick={() => setAmount(String(n))} style={{
                  padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
                  background: Number(amount) === n ? C.greenDim : C.input, color: C.text, cursor: "pointer",
                }}>{n}</button>
              ))}
            </div>
            <label style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>M-PESA PHONE</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", margin: "6px 0 16px",
                background: C.input, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: 12, color: C.text,
              }} />
            <button type="button" disabled={busy} onClick={payMpesa} style={{
              width: "100%", padding: 14, marginBottom: 8, background: C.green, border: "none",
              borderRadius: 10, fontWeight: 800, color: C.bg, cursor: "pointer",
            }}>Pay with M-Pesa</button>
            <button type="button" disabled={busy} onClick={payCard} style={{
              width: "100%", padding: 14, background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 10, fontWeight: 700, color: C.text, cursor: "pointer",
            }}>Pay with Card</button>
          </>
        )}
        <button type="button" onClick={onClose} style={{
          width: "100%", marginTop: 12, padding: 10, background: "none", border: "none",
          color: C.muted, cursor: "pointer",
        }}>Cancel</button>
      </div>
    </div>
  );
}

function WithdrawModal({ open, onClose, user, token, notify, onBalanceUpdate }) {
  const [amount, setAmount] = useState(String(MIN_WITHDRAWAL_KES));
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const submit = async () => {
    const kes = Math.round(Number(amount));
    if (!kes || kes < MIN_WITHDRAWAL_KES) return notify(`Minimum withdrawal is KES ${MIN_WITHDRAWAL_KES}`);
    setBusy(true);
    try {
      const data = await requestWithdrawal(kes, token);
      if (data.newBalance != null) onBalanceUpdate({ ...user, balance: data.newBalance });
      notify(data.message || "Withdrawal requested");
      onClose();
    } catch (e) {
      notify(e.message);
    }
    setBusy(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: C.card, borderRadius: "16px 16px 0 0", padding: 20,
        width: "100%", maxWidth: 420, border: `1px solid ${C.border}`,
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 4px", fontWeight: 800 }}>Withdraw to M-Pesa</h3>
        <p style={{ color: C.muted, fontSize: 12, margin: "0 0 12px" }}>
          Minimum KES {MIN_WITHDRAWAL_KES}. One request per week — Paystack settles in ~3 business days.
        </p>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={MIN_WITHDRAWAL_KES}
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: 12,
            background: C.input, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 12, color: C.text, fontSize: 18, fontWeight: 800,
          }} />
        <p style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>
          Available: KES {(user?.balance ?? 0).toFixed(2)} → {user?.phoneNumber}
        </p>
        <button type="button" disabled={busy} onClick={submit} style={{
          width: "100%", padding: 14, background: C.yellow, border: "none",
          borderRadius: 10, fontWeight: 800, color: "#000", cursor: "pointer",
        }}>{busy ? "Processing…" : "Request withdrawal"}</button>
        <button type="button" onClick={onClose} style={{
          width: "100%", marginTop: 12, padding: 10, background: "none", border: "none",
          color: C.muted, cursor: "pointer",
        }}>Cancel</button>
      </div>
    </div>
  );
}

function DashHeader({ user, onLogout, onDeposit, onWithdraw }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", padding: "12px 16px",
      background: C.nav, borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: C.green,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 900, color: C.bg,
      }}>O</div>
      <span style={{ marginLeft: 8, fontWeight: 800, fontSize: 13 }}>
        @{user?.username}
      </span>
      <div style={{ flex: 1 }} />
      <button type="button" onClick={onDeposit} style={{
        padding: "6px 10px", marginRight: 6, background: C.greenDim, border: `1px solid ${C.green}`,
        borderRadius: 8, color: C.green, fontSize: 11, fontWeight: 800, cursor: "pointer",
      }}>+ Deposit</button>
      <button type="button" onClick={onWithdraw} style={{
        padding: "6px 10px", marginRight: 8, background: "transparent", border: `1px solid ${C.border}`,
        borderRadius: 8, color: C.yellow, fontSize: 11, fontWeight: 700, cursor: "pointer",
      }}>Withdraw</button>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: "5px 12px", marginRight: 12,
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: "50%", background: C.yellow,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 900, color: "#000",
        }}>K</span>
        <span style={{ color: C.yellow, fontWeight: 700, fontSize: 14 }}>
          {(user?.balance ?? 0).toFixed(2)}
        </span>
      </div>
      <button onClick={onLogout}
        style={{ background: "none", border: "none", color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        Logout
      </button>
    </div>
  );
}

// ── Dashboard Tabs ────────────────────────────────────────────────────────────
function DashTabs({ tab, setTab }) {
  const tabs = [
    { key: "trade", label: "Trade", icon: "📈" },
    { key: "transactions", label: "History", icon: "📋" },
    { key: "profile", label: "Profile", icon: "👤" },
  ];
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.nav }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => setTab(t.key)} style={{
          flex: 1, padding: "13px 0", background: "none", border: "none", cursor: "pointer",
          color: tab === t.key ? C.green : C.muted,
          fontWeight: tab === t.key ? 700 : 500, fontSize: 13,
          borderBottom: tab === t.key ? `2px solid ${C.green}` : "2px solid transparent",
        }}>
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ user, token, notify, onUserUpdate }) {
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phoneNumber || "");
  const [cur, setCur] = useState(""), [nw, setNw] = useState(""), [cf, setCf] = useState("");
  const [saving, setSaving] = useState(false);

  const inp = {
    display: "block", width: "100%", background: C.input,
    border: `1px solid ${C.border}`, borderRadius: 10,
    padding: "12px 14px", color: C.text, fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };
  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.muted, marginBottom: 6, display: "block" };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const data = await apiFetch("/user/profile", {
        method: "PATCH", body: JSON.stringify({ email, phoneNumber: phone }),
      }, token);
      onUserUpdate(data.user);
      notify("Profile saved ✓");
    } catch (e) { notify(e.message); }
    setSaving(false);
  };

  const changePassword = async () => {
    if (!cur || !nw || !cf) return notify("Fill all password fields");
    if (nw !== cf) return notify("New passwords don't match");
    if (nw.length < 6) return notify("Min 6 characters");
    try {
      await apiFetch("/user/password", {
        method: "PATCH", body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
      }, token);
      setCur(""); setNw(""); setCf("");
      notify("Password updated ✓");
    } catch (e) { notify(e.message); }
  };

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      {/* Account info */}
      <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>USERNAME</span>
          <div style={{ ...inp, color: C.muted }}>@{user?.username}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>EMAIL</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inp, marginBottom: 0 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <span style={lbl}>PHONE (M-PESA)</span>
          <div style={{ display: "flex", gap: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: C.input, border: `1px solid ${C.border}`,
              borderRadius: "10px 0 0 10px", padding: "12px 10px",
              color: C.text, fontSize: 13,
            }}>🇰🇪 +254</div>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              style={{ ...inp, borderRadius: "0 10px 10px 0", flex: 1 }} />
          </div>
        </div>
        <button onClick={saveProfile} disabled={saving} style={{
          width: "100%", padding: 14, background: saving ? "#0f5c2a" : C.green,
          border: "none", borderRadius: 10, fontWeight: 800, color: C.bg, cursor: "pointer",
        }}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>

      {/* Password */}
      <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Change Password</div>
        <p style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Keep your account secure</p>
        {[["CURRENT PASSWORD", cur, setCur], ["NEW PASSWORD", nw, setNw], ["CONFIRM NEW PASSWORD", cf, setCf]].map(([l, v, s]) => (
          <div key={l} style={{ marginBottom: 12 }}>
            <span style={lbl}>{l}</span>
            <input type="password" value={v} onChange={(e) => s(e.target.value)} style={inp} />
          </div>
        ))}
        <button onClick={changePassword} style={{
          width: "100%", padding: 14, background: "transparent",
          border: `1px solid ${C.border}`, borderRadius: 10,
          fontWeight: 700, color: C.text, cursor: "pointer",
        }}>Update Password</button>
      </div>
    </div>
  );
}

// ── Transactions Tab ──────────────────────────────────────────────────────────
function TransactionsTab({ user, token, notify }) {
  const [txns, setTxns] = useState([]);
  const [summary, setSummary] = useState({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/transactions?type=${filter}&limit=50`, {}, token);
      setTxns(data.transactions);
      setSummary(data.summary);
    } catch (e) { notify(e.message); }
    setLoading(false);
  }, [filter, token]);

  useEffect(() => { load(); }, [load]);

  const typeColor = { deposit: C.green, withdrawal: C.red, trade_win: C.green, trade_loss: C.red };
  const typeLabel = { deposit: "Deposit", withdrawal: "Withdrawal", trade_win: "Trade Win", trade_loss: "Trade Loss" };

  const stats = [
    { label: "TOTAL DEPOSITS", val: `KES ${(summary.totalDeposits || 0).toFixed(2)}`, color: C.green },
    { label: "TOTAL WITHDRAWALS", val: `KES ${(summary.totalWithdrawals || 0).toFixed(2)}`, color: C.red },
    { label: "TRADE WINNINGS", val: `KES ${(summary.totalWinnings || 0).toFixed(2)}`, color: C.green },
    { label: "CURRENT BALANCE", val: `KES ${(summary.currentBalance || 0).toFixed(2)}`, color: C.yellow },
  ];

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>My Transactions</h2>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Your complete transaction history</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: C.muted, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
        }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{
            background: C.input, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "8px 12px", color: C.text, fontSize: 13,
          }}>
            <option value="all">All Types</option>
            <option value="deposit">Deposits</option>
            <option value="withdrawal">Withdrawals</option>
            <option value="trade_win">Trade Wins</option>
            <option value="trade_loss">Trade Losses</option>
          </select>
          <span style={{ fontSize: 12, color: C.muted }}>{txns.length} records</span>
        </div>

        {loading ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: C.muted }}>Loading…</div>
        ) : txns.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <p style={{ color: C.muted, fontSize: 14 }}>No transactions yet</p>
          </div>
        ) : (
          txns.map((tx) => (
            <div key={tx._id} style={{
              padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: typeColor[tx.type] || C.text }}>
                  {typeLabel[tx.type] || tx.type}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {new Date(tx.createdAt).toLocaleString()} · {tx.description}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: 15, fontWeight: 800,
                  color: tx.type.includes("win") || tx.type === "deposit" ? C.green : C.red,
                }}>
                  {tx.type === "withdrawal" || tx.type === "trade_loss" ? "-" : "+"}KES {tx.amount.toFixed(2)}
                </div>
                <div style={{ fontSize: 10, color: C.muted }}>Bal: KES {tx.balanceAfter.toFixed(2)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Auth Modal (Login / Signup) ────────────────────────────────────────────────
function AuthModal({ mode: initMode, onClose, onSuccess, notify }) {
  const [mode, setMode] = useState(initMode); // "login" | "signup"
  const [loading, setLoading] = useState(false);

  // Signup fields
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Login fields
  const [identifier, setIdentifier] = useState("");
  const [lPass, setLPass] = useState("");

  const inp = {
    display: "block", width: "100%", background: C.input,
    border: `1.5px solid ${C.border}`, borderRadius: 10,
    padding: "13px 15px", color: C.text, fontSize: 15,
    outline: "none", boxSizing: "border-box", marginBottom: 12,
  };
  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.muted, marginBottom: 7, display: "block" };

  const handleSignup = async () => {
    if (!username || !email || !phone || !password || !confirmPassword) {
      return notify("All fields are required");
    }
    setLoading(true);
    try {
      const data = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, phoneNumber: phone, password, confirmPassword }),
      });
      onSuccess(data.token, data.user);
      notify(`Welcome, @${data.user.username}! 🎉`);
    } catch (e) { notify(e.message); }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!identifier || !lPass) return notify("Please fill all fields");
    setLoading(true);
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password: lPass }),
      });
      onSuccess(data.token, data.user);
      notify(`Welcome back, @${data.user.username}!`);
    } catch (e) { notify(e.message); }
    setLoading(false);
  };

  return (
    <Modal onClose={onClose}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, justifyContent: "center", marginBottom: 8 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11, background: C.green,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 900, color: C.bg,
        }}>O</div>
        <span style={{ fontSize: 20, fontWeight: 900 }}>OkumuTraders</span>
      </div>

      {/* Tab toggle */}
      <div style={{ display: "flex", background: C.input, borderRadius: 10, padding: 3, marginBottom: 20 }}>
        {["login", "signup"].map((m) => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: "9px 0", background: mode === m ? C.card : "transparent",
            border: mode === m ? `1px solid ${C.border}` : "none",
            borderRadius: 8, color: mode === m ? C.text : C.muted,
            fontWeight: mode === m ? 700 : 500, fontSize: 14, cursor: "pointer",
          }}>{m === "login" ? "Sign In" : "Create Account"}</button>
        ))}
      </div>

      {mode === "login" ? (
        <>
          <span style={lbl}>EMAIL / USERNAME / PHONE</span>
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. 254712345678" style={inp} />
          <span style={lbl}>PASSWORD</span>
          <input type="password" value={lPass} onChange={(e) => setLPass(e.target.value)}
            placeholder="••••••••" style={{ ...inp, marginBottom: 20 }} />
          <button onClick={handleLogin} disabled={loading} style={{
            width: "100%", padding: 15, background: loading ? "#0f5c2a" : C.green,
            border: "none", borderRadius: 11, fontSize: 16, fontWeight: 800, color: C.bg, cursor: "pointer",
          }}>{loading ? "Signing in…" : "Sign In"}</button>
        </>
      ) : (
        <>
          <span style={lbl}>USERNAME</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. EdwinOmollo" style={inp} />
          <span style={lbl}>EMAIL</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" style={inp} />
          <span style={lbl}>PHONE NUMBER (M-PESA)</span>
          <div style={{ display: "flex", marginBottom: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, background: C.input,
              border: `1.5px solid ${C.border}`, borderRadius: "10px 0 0 10px",
              padding: "13px 10px", color: C.text, fontSize: 13, whiteSpace: "nowrap",
            }}>🇰🇪 +254</div>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="712345678"
              style={{ ...inp, borderRadius: "0 10px 10px 0", flex: 1, marginBottom: 0 }} />
          </div>
          <span style={lbl}>PASSWORD</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 6 characters" style={inp} />
          <span style={lbl}>CONFIRM PASSWORD</span>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat password" style={{ ...inp, marginBottom: 20 }} />
          <button onClick={handleSignup} disabled={loading} style={{
            width: "100%", padding: 15, background: loading ? "#0f5c2a" : C.green,
            border: "none", borderRadius: 11, fontSize: 16, fontWeight: 800, color: C.bg, cursor: "pointer",
          }}>{loading ? "Creating account…" : "Create Account"}</button>
        </>
      )}
    </Modal>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 20, overflowY: "auto",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.card, borderRadius: 20, padding: "28px 22px",
        width: "100%", maxWidth: 380, border: `1.5px solid ${C.border}`,
        maxHeight: "90vh", overflowY: "auto",
      }}>{children}</div>
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: "#1a2d48", border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "12px 20px", fontSize: 13,
      fontWeight: 600, zIndex: 200, whiteSpace: "nowrap",
    }}>{msg}</div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [token, setToken] = useState(() => localStorage.getItem("ot_token"));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ot_user")); } catch { return null; }
  });
  const [loggedIn, setLoggedIn] = useState(!!token);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [dashTab, setDashTab] = useState("trade");
  const [authMode, setAuthMode] = useState(null); // null | "login" | "signup"
  const [notif, setNotif] = useState(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  // ── Chart state ─────────────────────────────────────────────────────────────
  const [chartData, setChartData] = useState([]);
  const [rate, setRate] = useState(2.4477);
  const [pct, setPct] = useState(244.77);
  const [tf, setTf] = useState("1m");
  const tRef = useRef(0);

  // ── Trade state ─────────────────────────────────────────────────────────────
  const [amount, setAmount] = useState(200);
  const [customAmt, setCustomAmt] = useState("200");
  const [activeTrade, setActiveTrade] = useState(null);
  const [pl, setPl] = useState(0);
  const [tradeLoading, setTradeLoading] = useState(false);

  // ── Live feed + stats ───────────────────────────────────────────────────────
  const [activityFeed, setActivityFeed] = useState([]);
  const [platformStats, setPlatformStats] = useState({
    volume24h: 1_300_000, tradersOnline: 847, totalPayouts: 3_000_000, activeTrades: 214,
  });

  const notify = (msg) => { setNotif(msg); setTimeout(() => setNotif(null), 3500); };

  // ── Restore session on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (token) {
      apiFetch("/auth/me", {}, token)
        .then((d) => { setUser(d.user); setLoggedIn(true); })
        .catch(() => { localStorage.removeItem("ot_token"); localStorage.removeItem("ot_user"); setLoggedIn(false); setToken(null); });
    }
  }, []);

  // ── Chart init + tick ───────────────────────────────────────────────────────
  useEffect(() => {
    const d = [];
    for (let i = 0; i < N; i++) { tRef.current = i * 0.2; d.push(genPt(tRef.current)); }
    setChartData(d);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      tRef.current += 0.2;
      setChartData((p) => [...p.slice(1), genPt(tRef.current)]);
      setRate((r) => Math.min(5, Math.max(0.5, +(r + (Math.random() - 0.48) * 0.0019).toFixed(4))));
      setPct((p) => +(p + (Math.random() - 0.5) * 0.35).toFixed(2));
    }, 280);
    return () => clearInterval(id);
  }, []);

  // ── P&L calculation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTrade) { setPl(0); return; }
    const dir = activeTrade.direction === "BUY" ? 1 : -1;
    setPl(+((rate - activeTrade.entryRate) * dir * activeTrade.amount * 48).toFixed(2));
  }, [rate, activeTrade]);

  // ── Socket.IO ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });

    socket.on("activity", (event) => {
      setActivityFeed((prev) => [event, ...prev].slice(0, 40));
    });

    socket.on("stats", (stats) => {
      setPlatformStats(stats);
    });

    // initial stats
    apiFetch("/stats/platform").then((d) => setPlatformStats(d.stats)).catch(() => {});

    return () => socket.disconnect();
  }, []);

  // ── Auth handlers ───────────────────────────────────────────────────────────
  const handleAuthSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    setLoggedIn(true);
    setAuthMode(null);
    setDashTab("trade");
    localStorage.setItem("ot_token", newToken);
    localStorage.setItem("ot_user", JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setToken(null); setUser(null); setLoggedIn(false);
    localStorage.removeItem("ot_token"); localStorage.removeItem("ot_user");
    notify("Logged out");
  };

  const handleUserUpdate = (updated) => {
    setUser(updated);
    localStorage.setItem("ot_user", JSON.stringify(updated));
  };

  // Paystack return URL ?payment=verify&ref=...
  useEffect(() => {
    if (!token || !loggedIn) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "verify") return;
    const ref = params.get("ref");
    if (!ref) return;
    (async () => {
      try {
        const result = await verifyPayment(ref, token);
        if (result.status === "success") {
          handleUserUpdate({ ...user, balance: result.newBalance });
          notify(`Deposit confirmed ✓`);
        }
      } catch (e) {
        notify(e.message);
      }
      window.history.replaceState({}, "", window.location.pathname);
    })();
  }, [token, loggedIn]);

  // ── Trade handlers ──────────────────────────────────────────────────────────
  const doTrade = async (direction) => {
    if (!loggedIn) { setAuthMode("login"); return; }
    if (tradeLoading) return;

    if (activeTrade) {
      // Close trade
      setTradeLoading(true);
      try {
        const data = await apiFetch("/trade/close", {
          method: "POST",
          body: JSON.stringify({ tradeId: activeTrade._id, exitRate: rate }),
        }, token);
        setActiveTrade(null);
        handleUserUpdate({ ...user, balance: data.newBalance });
        notify(`Closed. P&L: KES ${data.pnl >= 0 ? "+" : ""}${data.pnl} ${data.result === "win" ? "🎉" : "📉"}`);
      } catch (e) { notify(e.message); }
      setTradeLoading(false);
    } else {
      // Open trade
      if ((user?.balance ?? 0) < amount) {
        return notify("Insufficient balance. Please deposit.");
      }
      setTradeLoading(true);
      try {
        const data = await apiFetch("/trade/open", {
          method: "POST",
          body: JSON.stringify({ direction, amount, entryRate: rate }),
        }, token);
        setActiveTrade(data.trade);
        handleUserUpdate({ ...user, balance: (user.balance - amount) });
        notify(`${direction} opened @ ${rate.toFixed(4)}`);
      } catch (e) { notify(e.message); }
      setTradeLoading(false);
    }
  };

  // ── Shared styles ───────────────────────────────────────────────────────────
  const shell = {
    background: C.bg, minHeight: "100vh", color: C.text,
    fontFamily: "system-ui, sans-serif", maxWidth: 420,
    margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden",
  };

  // ── Trade view (reused in both logged-in and public) ──────────────────────
  const TradeView = () => (
    <>
      <div style={{ padding: "9px 14px 2px" }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: C.green }}>{rate.toFixed(4)}</span>
        <span style={{
          fontSize: 13, fontWeight: 700, color: C.green,
          background: C.greenDim, padding: "3px 9px", borderRadius: 5, marginLeft: 6,
        }}>+{pct.toFixed(2)}%</span>
      </div>

      {/* Timeframe selector */}
      <div style={{ display: "flex", gap: 5, padding: "6px 14px" }}>
        {["30s", "1m", "2m", "5m"].map((t) => (
          <button key={t} onClick={() => setTf(t)} style={{
            padding: "4px 12px",
            background: tf === t ? C.green : "transparent",
            border: tf === t ? "none" : `1px solid ${C.border}`,
            borderRadius: 6, fontSize: 12, fontWeight: 700,
            color: tf === t ? C.bg : C.muted, cursor: "pointer",
          }}>{t}</button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ display: "flex" }}>
        <div style={{
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "6px 6px 6px 14px", fontSize: 11, color: C.muted, height: 220,
        }}>
          {Y_LABELS.map((v) => <span key={v}>{v.toFixed(1)}</span>)}
        </div>
        <div style={{ flex: 1, height: 220 }}>
          <LiveChart data={chartData} rate={rate} />
        </div>
      </div>

      {/* Trade panel */}
      <div style={{ background: C.card, borderTop: `1px solid ${C.border}`, padding: "12px 14px" }}>
        {/* Amount selector */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: C.input, borderRadius: 8, padding: "8px 12px",
            border: `1.5px solid ${C.border}`, flex: 1,
          }}>
            <span style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>KES</span>
            <input value={customAmt}
              onChange={(e) => {
                setCustomAmt(e.target.value);
                const v = parseInt(e.target.value);
                if (!isNaN(v) && v > 0) setAmount(v);
              }}
              style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 16, fontWeight: 800, width: 60 }} />
          </div>
          {[50, 100, 200, 500].map((c) => (
            <button key={c} onClick={() => { setAmount(c); setCustomAmt(String(c)); }} style={{
              padding: "8px 10px",
              background: amount === c ? C.greenDim : C.input,
              border: amount === c ? `1.5px solid ${C.green}` : `1.5px solid ${C.border}`,
              borderRadius: 8, fontSize: 13, fontWeight: 700,
              color: amount === c ? C.green : C.muted, cursor: "pointer",
            }}>{c}</button>
          ))}
        </div>

        {/* P&L row */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>
            {activeTrade ? `${activeTrade.direction} @ ${activeTrade.entryRate}` : "AUTOSELL · 10"}
          </span>
          <span style={{ fontWeight: 900, color: pl > 0 ? C.green : pl < 0 ? C.red : C.muted }}>
            P&L KES {pl > 0 ? "+" : ""}{pl.toFixed(2)}
          </span>
        </div>

        {/* BUY / SELL */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => doTrade("BUY")} disabled={tradeLoading}
            style={{
              flex: 1, padding: 16, background: activeTrade?.direction === "SELL" ? C.input : C.green,
              border: "none", borderRadius: 11, fontSize: 17, fontWeight: 900,
              color: activeTrade?.direction === "SELL" ? C.muted : C.bg, cursor: "pointer",
              opacity: tradeLoading ? 0.7 : 1,
            }}>
            {activeTrade?.direction === "BUY" ? "CLOSE BUY" : "BUY"}
          </button>
          <button onClick={() => doTrade("SELL")} disabled={tradeLoading}
            style={{
              flex: 1, padding: 16, background: activeTrade?.direction === "BUY" ? C.input : C.redBtn,
              border: "none", borderRadius: 11, fontSize: 17, fontWeight: 900,
              color: activeTrade?.direction === "BUY" ? C.muted : "#fff", cursor: "pointer",
              opacity: tradeLoading ? 0.7 : 1,
            }}>
            {activeTrade?.direction === "SELL" ? "CLOSE SELL" : "SELL"}
          </button>
        </div>

        {/* Not logged in CTA */}
        {!loggedIn && (
          <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: C.muted }}>
            <button onClick={() => setAuthMode("signup")} style={{
              background: "none", border: "none", color: C.green,
              fontWeight: 700, cursor: "pointer", fontSize: 12,
            }}>Sign up</button> or <button onClick={() => setAuthMode("login")} style={{
              background: "none", border: "none", color: C.green,
              fontWeight: 700, cursor: "pointer", fontSize: 12,
            }}>log in</button> to start trading
          </div>
        )}
      </div>

      {/* Activity Feed (shown below trade panel) */}
      <div style={{ padding: "10px 14px 14px" }}>
        <ActivityFeed items={activityFeed} />
      </div>
    </>
  );

  // ── Logged-in dashboard ────────────────────────────────────────────────────
  if (loggedIn && user) {
    return (
      <div style={shell}>
        <DashHeader
          user={user}
          onLogout={handleLogout}
          onDeposit={() => setShowDeposit(true)}
          onWithdraw={() => setShowWithdraw(true)}
        />
        <StatsBar stats={platformStats} />
        <DashTabs tab={dashTab} setTab={setDashTab} />

        {dashTab === "trade" && (
          <div style={{ flex: 1, overflowY: "auto" }}><TradeView /></div>
        )}
        {dashTab === "transactions" && (
          <TransactionsTab user={user} token={token} notify={notify} />
        )}
        {dashTab === "profile" && (
          <ProfileTab user={user} token={token} notify={notify} onUserUpdate={handleUserUpdate} />
        )}

        <DepositModal
          open={showDeposit}
          onClose={() => setShowDeposit(false)}
          user={user}
          token={token}
          notify={notify}
          onBalanceUpdate={handleUserUpdate}
        />
        <WithdrawModal
          open={showWithdraw}
          onClose={() => setShowWithdraw(false)}
          user={user}
          token={token}
          notify={notify}
          onBalanceUpdate={handleUserUpdate}
        />
        {notif && <Toast msg={notif} />}
      </div>
    );
  }

  // ── Public landing ─────────────────────────────────────────────────────────
  return (
    <div style={shell}>
      {/* Top nav */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
        background: C.nav, borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: C.green,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, color: C.bg,
        }}>O</div>
        <span style={{ fontWeight: 900, fontSize: 15, flex: 1 }}>OkumuTraders.com</span>
        <button onClick={() => setAuthMode("login")} style={{
          padding: "5px 12px", background: "transparent",
          border: `1.5px solid ${C.border}`, borderRadius: 7,
          color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>Login</button>
        <button onClick={() => setAuthMode("signup")} style={{
          padding: "5px 12px", background: C.green, border: "none",
          borderRadius: 7, color: C.bg, fontSize: 12, fontWeight: 800, cursor: "pointer",
        }}>Sign Up</button>
      </div>

      <StatsBar stats={platformStats} />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <TradeView />
      </div>

      <div style={{ textAlign: "center", padding: 8, fontSize: 10, color: C.sub }}>
        Licensed in The Bahamas · BHA-0023-1873201
      </div>

      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={handleAuthSuccess}
          notify={notify}
        />
      )}

      {notif && <Toast msg={notif} />}
    </div>
  );
}
