// ─── Live Feed Simulator ──────────────────────────────────────────────────────
// Pushes two types of Socket.IO events to all connected clients:
//
//   1. "activity"   — random win/withdrawal announcements (left sidebar)
//   2. "stats"      — platform dashboard numbers (24h volume, traders online, payouts)
//
// Nothing here touches the database — it's pure simulation for UI realism.

const KENYAN_NAMES = [
  'OtienoKE', 'AchiengM', 'KamauWa', 'WanjiruJ', 'MosesNg',
  'FatumaMo', 'KipchogeME', 'AmondiR', 'NjeruTK', 'OdhiamboF',
  'MuthuiMW', 'SharonAK', 'EdwinOm', 'DavidMut', 'GraceWan',
  'BrianOko', 'CynthiaA', 'PeterKib', 'MargaretN', 'RobertOt',
  'AlinaWa', 'JohnsonM', 'LucyAchi', 'FrancisK', 'HildaNj',
  'SamuelOd', 'ViolaKe', 'NicholasM', 'BettyAm', 'CharlesOt',
  'AnneMut', 'StephenKam', 'RoseMuig', 'PaulOwino', 'DorisNg',
];

const WIN_AMOUNTS  = [500, 800, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
const WITHD_AMOUNTS = [1000, 1500, 2000, 3000, 4500, 5000, 6000, 7500, 8000, 10000, 11300, 15000];

function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatKES(n) {
  return n >= 1000 ? `KES ${(n / 1000).toFixed(1)}k` : `KES ${n}`;
}

function generateActivity() {
  const name = randItem(KENYAN_NAMES);
  const isWin = Math.random() > 0.35; // 65% wins for positivity

  if (isWin) {
    const amt = randItem(WIN_AMOUNTS);
    return {
      type: 'win',
      message: `🎉 Congratulations @${name} has won KES ${amt.toLocaleString()}`,
      amount: amt,
      username: name,
      ts: Date.now(),
    };
  } else {
    const amt = randItem(WITHD_AMOUNTS);
    return {
      type: 'withdrawal',
      message: `💸 @${name} withdrawn KES ${amt.toLocaleString()}`,
      amount: amt,
      username: name,
      ts: Date.now(),
    };
  }
}

// ── Platform stats (seed values + running totals) ─────────────────────────────
let platformStats = {
  volume24h: 1_300_000,          // KES 1.3M
  tradersOnline: 847,
  totalPayouts: 3_000_000,       // KES 3M (starting point, grows slowly)
  activeTrades: 214,
};

function getPlatformStats() {
  return { ...platformStats };
}

// ── Gradual drift ─────────────────────────────────────────────────────────────
function tickStats() {
  // Volume fluctuates ±0.3% per tick
  platformStats.volume24h = Math.round(
    platformStats.volume24h * (1 + (Math.random() - 0.48) * 0.006)
  );
  platformStats.volume24h = Math.max(900_000, Math.min(2_500_000, platformStats.volume24h));

  // Traders online: ±3
  platformStats.tradersOnline += Math.floor((Math.random() - 0.45) * 6);
  platformStats.tradersOnline = Math.max(200, Math.min(2000, platformStats.tradersOnline));

  // Active trades: ±2
  platformStats.activeTrades += Math.floor((Math.random() - 0.48) * 4);
  platformStats.activeTrades = Math.max(50, Math.min(800, platformStats.activeTrades));

  // Total payouts only ever increase (by KES 200–1500 per tick)
  platformStats.totalPayouts += Math.round(200 + Math.random() * 1300);
}

// ── Main entry point ──────────────────────────────────────────────────────────
function startLiveFeedSimulator(io) {
  // Activity feed: fire every 3–8 seconds with a random announcement
  const broadcastActivity = () => {
    const event = generateActivity();
    io.emit('activity', event);

    // Schedule next with jitter so it feels organic
    const delay = 3000 + Math.random() * 5000;
    setTimeout(broadcastActivity, delay);
  };
  setTimeout(broadcastActivity, 2000); // first event 2s after boot

  // Stats tick every 4 seconds
  setInterval(() => {
    tickStats();
    io.emit('stats', getPlatformStats());
  }, 4000);

  console.log('📡  Live feed simulator running');
}

module.exports = { startLiveFeedSimulator, getPlatformStats };
