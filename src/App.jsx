import { useState, useEffect, useRef } from "react";

const C = {
  bg: "#07101f", card: "#0c1828", input: "#101f35", border: "#182c45",
  green: "#1cd25e", greenDim: "#071a0e", red: "#ff6b7a", yellow: "#f5c518",
  text: "#ffffff", muted: "#566a88", sub: "#334055", nav: "#0a1422",
};

const Y_MIN = -3, Y_MAX = 3, N = 90, Y_LABELS = [3, 1.5, 0, -1.5, -3];
const genPt = (t) => Math.sin(t * 0.38) * 1.35 + Math.sin(t * 1.15) * 0.55 + Math.sin(t * 2.9) * 0.28 + (Math.random() - 0.5) * 0.22;

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
        <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1cd25e" stopOpacity="0.6" /><stop offset="100%" stopColor="#1cd25e" stopOpacity="0.04" /></linearGradient>
        <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff2d55" stopOpacity="0.03" /><stop offset="100%" stopColor="#ff2d55" stopOpacity="0.5" /></linearGradient>
      </defs>
      <line x1="0" y1={zY} x2={W} y2={zY} stroke="#253a58" strokeWidth="1.5" />
      <path d={areaPath} fill="url(#gg)" clipPath="url(#ab)" />
      <path d={areaPath} fill="url(#rg)" clipPath="url(#bl)" />
      <path d={linePath} fill="none" stroke="#1cd25e" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="7" fill="#1cd25e" />
      <rect x={W - 190} y="10" width="180" height="36" rx="6" fill="#0f1f36" />
      <text x={W - 100} y="34" textAnchor="middle" fill="white" fontSize="18" fontFamily="monospace" fontWeight="800">Rate: {rate.toFixed(4)}</text>
    </svg>
  );
}

function DashHeader({ balance, onLogout }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", background: C.nav, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: C.bg }}>O</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "5px 12px", marginRight: 12 }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#000" }}>K</span>
        <span style={{ color: C.yellow, fontWeight: 700, fontSize: 14 }}>{balance.toFixed(2)}</span>
      </div>
      <button onClick={onLogout} style={{ background: "none", border: "none", color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Logout</button>
    </div>
  );
}

function DashTabs({ tab, setTab }) {
  const tabs = ["profile", "transactions", "trade"];
  const labels = { profile: "Profile", transactions: "Transactions", trade: "Trade" };
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.nav }}>
      {tabs.map((t) => (
        <button key={t} onClick={() => setTab(t)} style={{
          flex: 1, padding: "14px 0", background: "none", border: "none", cursor: "pointer",
          color: tab === t ? C.green : C.muted, fontWeight: tab === t ? 700 : 500, fontSize: 14,
          borderBottom: tab === t ? `2px solid ${C.green}` : "2px solid transparent",
        }}>{labels[t]}</button>
      ))}
    </div>
  );
}

function ProfileTab({ email, setEmail, phone, setPhone, onSave, notify }) {
  const [cur, setCur] = useState(""), [nw, setNw] = useState(""), [cf, setCf] = useState("");
  const inp = { display: "block", width: "100%", background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.muted, marginBottom: 6, display: "block" };
  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <span style={lbl}>EMAIL</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inp, marginBottom: 14 }} />
        <span style={lbl}>PHONE (M-PESA)</span>
        <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.input, border: `1px solid ${C.border}`, borderRadius: "10px 0 0 10px", padding: "12px 10px", color: C.text, fontSize: 13 }}>
            <span>🇰🇪</span><span>+254</span>
          </div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...inp, borderRadius: "0 10px 10px 0", flex: 1 }} />
        </div>
        <button onClick={onSave} style={{ width: "100%", padding: 14, background: C.green, border: "none", borderRadius: 10, fontWeight: 800, color: C.bg, cursor: "pointer" }}>Save Changes</button>
      </div>
      <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Change Password</div>
        <p style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>Keep your account secure with a strong password</p>
        {["CURRENT PASSWORD", "NEW PASSWORD", "CONFIRM NEW PASSWORD"].map((l, i) => (
          <div key={l} style={{ marginBottom: 12 }}>
            <span style={lbl}>{l}</span>
            <input type="password" value={[cur, nw, cf][i]} onChange={(e) => [setCur, setNw, setCf][i](e.target.value)} style={inp} />
            {i === 1 && <span style={{ fontSize: 11, color: C.muted }}>Min 6 characters</span>}
          </div>
        ))}
        <button onClick={() => nw.length >= 6 && nw === cf ? notify("Password updated") : notify("Check password fields")} style={{
          width: "100%", padding: 14, background: "transparent", border: `1px solid ${C.border}`,
          borderRadius: 10, fontWeight: 700, color: C.text, cursor: "pointer",
        }}>Update Password</button>
      </div>
    </div>
  );
}

function TransactionsTab() {
  const stats = [
    { label: "TOTAL DEPOSITS", val: "KES 0.00", color: C.green },
    { label: "TOTAL WITHDRAWALS", val: "KES 0.00", color: C.red },
    { label: "TRADE WINNINGS", val: "KES 0.00", color: C.green },
    { label: "CURRENT BALANCE", val: "KES 0.00", color: C.yellow },
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
          <select style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13 }}>
            <option>All Types</option>
          </select>
          <span style={{ fontSize: 12, color: C.muted }}>0 records</span>
        </div>
        <div style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <p style={{ color: C.muted, fontSize: 14 }}>No transactions yet</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [dashTab, setDashTab] = useState("profile");
  const [showLogin, setShowLogin] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [data, setData] = useState([]);
  const [rate, setRate] = useState(2.4477);
  const [pct, setPct] = useState(244.77);
  const [tf, setTf] = useState("1m");
  const [amount, setAmount] = useState(100);
  const [customAmt, setCustomAmt] = useState("100");
  const [activeTrade, setActiveTrade] = useState(null);
  const [pl, setPl] = useState(0);
  const [trades, setTrades] = useState([]);
  const [notif, setNotif] = useState(null);
  const [balance] = useState(0);
  const [email, setEmail] = useState("user@okumutraders.com");
  const [phone, setPhone] = useState("712345678");
  const [lUser, setLUser] = useState("");
  const [lPass, setLPass] = useState("");
  const [dAmt, setDAmt] = useState("500");
  const [dPhone, setDPhone] = useState("254712345678");
  const [stkSent, setStkSent] = useState(false);
  const tRef = useRef(0);

  useEffect(() => {
    const d = [];
    for (let i = 0; i < N; i++) { tRef.current = i * 0.2; d.push(genPt(tRef.current)); }
    setData(d);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      tRef.current += 0.2;
      setData((p) => [...p.slice(1), genPt(tRef.current)]);
      setRate((r) => Math.min(5, Math.max(0.5, +(r + (Math.random() - 0.48) * 0.0019).toFixed(4))));
      setPct((p) => +(p + (Math.random() - 0.5) * 0.35).toFixed(2));
    }, 280);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!activeTrade) { setPl(0); return; }
    const dir = activeTrade.type === "BUY" ? 1 : -1;
    setPl(+((rate - activeTrade.entry) * dir * activeTrade.amount * 48).toFixed(2));
  }, [rate, activeTrade]);

  const notify = (msg) => { setNotif(msg); setTimeout(() => setNotif(null), 3000); };
  const doLogin = () => { setLoggedIn(true); setShowLogin(false); setDashTab("profile"); notify("Welcome back!"); };
  const shell = { background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "system-ui,sans-serif", maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden" };
  const inp = { display: "block", width: "100%", background: C.input, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "13px 15px", color: C.text, fontSize: 15, outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.muted, marginBottom: 7, display: "block" };

  const doTrade = (type) => {
    if (activeTrade) {
      const dir = activeTrade.type === "BUY" ? 1 : -1;
      const pnl = +((rate - activeTrade.entry) * dir * activeTrade.amount * 48).toFixed(2);
      setTrades((t) => [{ ...activeTrade, exit: rate, pnl, time: new Date().toLocaleTimeString() }, ...t].slice(0, 30));
      notify(`Closed. P&L: KES ${pnl >= 0 ? "+" : ""}${pnl}`);
      setActiveTrade(null);
    } else { setActiveTrade({ type, entry: rate, amount }); notify(`${type} opened`); }
  };

  const TradeView = () => (
    <>
      <div style={{ padding: "9px 14px 2px" }}>
        <span style={{ fontSize: 32, fontWeight: 900, color: C.green }}>{rate.toFixed(4)}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.green, background: C.greenDim, padding: "3px 9px", borderRadius: 5, marginLeft: 6 }}>+{pct.toFixed(2)}%</span>
      </div>
      <div style={{ display: "flex", gap: 5, padding: "6px 14px" }}>
        {["30s", "1m", "2m", "5m"].map((t) => (
          <button key={t} onClick={() => setTf(t)} style={{ padding: "4px 12px", background: tf === t ? C.green : "transparent", border: tf === t ? "none" : `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 700, color: tf === t ? C.bg : C.muted, cursor: "pointer" }}>{t}</button>
        ))}
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "6px 6px 6px 14px", fontSize: 11, color: C.muted, height: 220 }}>
          {Y_LABELS.map((v) => <span key={v}>{v.toFixed(1)}</span>)}
        </div>
        <div style={{ flex: 1, height: 220 }}><LiveChart data={data} rate={rate} /></div>
      </div>
      <div style={{ background: C.card, borderTop: `1px solid ${C.border}`, padding: "12px 14px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.input, borderRadius: 8, padding: "8px 12px", border: `1.5px solid ${C.border}`, flex: 1 }}>
            <span style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>KES</span>
            <input value={customAmt} onChange={(e) => { setCustomAmt(e.target.value); const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setAmount(v); }} style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 16, fontWeight: 800, width: 60 }} />
          </div>
          {[50, 100, 200, 500].map((c) => (
            <button key={c} onClick={() => { setAmount(c); setCustomAmt(String(c)); }} style={{ padding: "8px 10px", background: amount === c ? C.greenDim : C.input, border: amount === c ? `1.5px solid ${C.green}` : `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: amount === c ? C.green : C.muted, cursor: "pointer" }}>{c}</button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>AUTOSELL · 10</span>
          <span style={{ fontWeight: 900, color: pl > 0 ? C.green : pl < 0 ? C.red : C.muted }}>P&L KES {pl > 0 ? "+" : ""}{pl.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => doTrade("BUY")} style={{ flex: 1, padding: 16, background: C.green, border: "none", borderRadius: 11, fontSize: 17, fontWeight: 900, color: C.bg, cursor: "pointer" }}>{activeTrade?.type === "BUY" ? "CLOSE" : "BUY"}</button>
          <button onClick={() => doTrade("SELL")} style={{ flex: 1, padding: 16, background: "#ff2d55", border: "none", borderRadius: 11, fontSize: 17, fontWeight: 900, color: "#fff", cursor: "pointer" }}>{activeTrade?.type === "SELL" ? "CLOSE" : "SELL"}</button>
        </div>
      </div>
    </>
  );

  if (loggedIn) {
    return (
      <div style={{ ...shell, minHeight: "100vh" }}>
        <DashHeader balance={balance} onLogout={() => { setLoggedIn(false); setDashTab("profile"); }} />
        <DashTabs tab={dashTab} setTab={setDashTab} />
        {dashTab === "profile" && <ProfileTab email={email} setEmail={setEmail} phone={phone} setPhone={setPhone} onSave={() => notify("Saved")} notify={notify} />}
        {dashTab === "transactions" && <TransactionsTab />}
        {dashTab === "trade" && <div style={{ flex: 1, overflowY: "auto" }}><TradeView /></div>}
        {notif && <Toast msg={notif} />}
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: C.nav, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: C.bg }}>O</div>
        <span style={{ fontWeight: 900, fontSize: 15, flex: 1 }}>OkumuTraders.com</span>
        <button onClick={() => setShowLogin(true)} style={{ padding: "5px 12px", background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 7, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Login</button>
        <button onClick={() => setShowLogin(true)} style={{ padding: "5px 12px", background: C.green, border: "none", borderRadius: 7, color: C.bg, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Sign Up</button>
      </div>
      <TradeView />
      <div style={{ textAlign: "center", padding: 8, fontSize: 10, color: C.sub }}>Licensed in The Bahamas · BHA-0023-1873201</div>
      {showLogin && (
        <Modal onClose={() => setShowLogin(false)}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, justifyContent: "center", marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: C.bg }}>O</div>
            <span style={{ fontSize: 20, fontWeight: 900 }}>OkumuTraders</span>
          </div>
          <p style={{ textAlign: "center", color: C.muted, marginBottom: 20, fontSize: 13 }}>Sign in to your trading account</p>
          <span style={lbl}>EMAIL OR PHONE</span>
          <input value={lUser} onChange={(e) => setLUser(e.target.value)} placeholder="e.g. 254712345678" style={{ ...inp, marginBottom: 14 }} />
          <span style={lbl}>PASSWORD</span>
          <input type="password" value={lPass} onChange={(e) => setLPass(e.target.value)} placeholder="••••••••" style={{ ...inp, marginBottom: 20 }} />
          <button onClick={doLogin} style={{ width: "100%", padding: 15, background: C.green, border: "none", borderRadius: 11, fontSize: 16, fontWeight: 800, color: C.bg, cursor: "pointer" }}>Sign In</button>
        </Modal>
      )}
      {showDeposit && (
        <Modal onClose={() => setShowDeposit(false)}>
          <h3 style={{ textAlign: "center", marginBottom: 20, color: C.green }}>Deposit via M-Pesa</h3>
          <span style={lbl}>AMOUNT (KES)</span>
          <input value={dAmt} onChange={(e) => setDAmt(e.target.value)} style={{ ...inp, marginBottom: 14 }} />
          <span style={lbl}>M-PESA PHONE</span>
          <input value={dPhone} onChange={(e) => setDPhone(e.target.value)} style={{ ...inp, marginBottom: 18 }} />
          <button onClick={() => { notify("STK Push sent"); setStkSent(true); setTimeout(() => { setStkSent(false); setShowDeposit(false); }, 2000); }} style={{ width: "100%", padding: 15, background: stkSent ? "#0a6e2a" : C.green, border: "none", borderRadius: 11, fontWeight: 800, color: C.bg, cursor: "pointer" }}>{stkSent ? "Sending..." : "Send STK Push"}</button>
        </Modal>
      )}
      {notif && <Toast msg={notif} />}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }} onClick={onClose}>
      <div style={{ background: C.card, borderRadius: 20, padding: "28px 22px", width: "100%", maxWidth: 360, border: `1.5px solid ${C.border}` }} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1a2d48", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 600, zIndex: 200 }}>
      {msg}
    </div>
  );
}
