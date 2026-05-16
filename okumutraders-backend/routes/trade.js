const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Trade = require('../models/Trade');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

router.use(protect);

// ─── P&L formula (mirrors frontend logic) ────────────────────────────────────
// OTC binary-style: profit/loss is stake × multiplier based on direction vs rate move
const MULTIPLIER = 48; // same as frontend: (rate - entry) * dir * amount * 48
const MIN_STAKE = 1; // KES — production: 200

function calcPnl(direction, entryRate, exitRate, amount) {
  const dir = direction === 'BUY' ? 1 : -1;
  return +((exitRate - entryRate) * dir * amount * MULTIPLIER).toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trade/open
// Body: { direction: 'BUY'|'SELL', amount, entryRate, timeframeSeconds }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/open', async (req, res) => {
  try {
    const { direction, amount, entryRate, timeframeSeconds = 60 } = req.body;

    if (!['BUY', 'SELL'].includes(direction)) {
      return res.status(400).json({ success: false, message: 'direction must be BUY or SELL' });
    }
    if (!amount || amount < MIN_STAKE) {
      return res.status(400).json({ success: false, message: `Minimum stake is KES ${MIN_STAKE}` });
    }
    if (!entryRate) {
      return res.status(400).json({ success: false, message: 'entryRate is required' });
    }

    // Check balance
    const user = await User.findById(req.user._id);
    if (user.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // Check for existing open trade
    const existing = await Trade.findOne({ user: req.user._id, status: 'open' });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You already have an open trade. Close it first.' });
    }

    // Deduct stake from balance immediately (held in escrow)
    user.balance = +(user.balance - amount).toFixed(2);
    await user.save({ validateBeforeSave: false });

    const trade = await Trade.create({
      user: req.user._id,
      direction,
      amount,
      entryRate,
      timeframeSeconds,
      openedAt: new Date(),
    });

    res.status(201).json({ success: true, trade });
  } catch (err) {
    console.error('Open trade error:', err);
    res.status(500).json({ success: false, message: 'Failed to open trade' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trade/close
// Body: { tradeId, exitRate }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/close', async (req, res) => {
  try {
    const { tradeId, exitRate } = req.body;

    if (!tradeId || !exitRate) {
      return res.status(400).json({ success: false, message: 'tradeId and exitRate are required' });
    }

    const trade = await Trade.findOne({ _id: tradeId, user: req.user._id, status: 'open' });
    if (!trade) {
      return res.status(404).json({ success: false, message: 'Open trade not found' });
    }

    const pnl = calcPnl(trade.direction, trade.entryRate, exitRate, trade.amount);
    const isWin = pnl >= 0;

    // ── Settle trade ──────────────────────────────────────────────────────────
    trade.exitRate = exitRate;
    trade.pnl = pnl;
    trade.status = isWin ? 'closed_win' : 'closed_loss';
    trade.closedAt = new Date();
    await trade.save();

    // ── Update user wallet ────────────────────────────────────────────────────
    const user = await User.findById(req.user._id);
    const balanceBefore = user.balance;

    if (isWin) {
      // Return stake + profit
      user.balance = +(user.balance + trade.amount + pnl).toFixed(2);
      user.totalWinnings = +(user.totalWinnings + pnl).toFixed(2);
    } else {
      // Stake already deducted on open; record the loss amount
      user.totalLosses = +(user.totalLosses + Math.abs(pnl)).toFixed(2);
      // If partial loss: return remainder (stake + negative pnl, floor at 0)
      const returnAmt = Math.max(0, trade.amount + pnl);
      if (returnAmt > 0) {
        user.balance = +(user.balance + returnAmt).toFixed(2);
      }
    }
    await user.save({ validateBeforeSave: false });

    // ── Record transaction ────────────────────────────────────────────────────
    await Transaction.create({
      user: req.user._id,
      type: isWin ? 'trade_win' : 'trade_loss',
      amount: Math.abs(pnl),
      balanceBefore,
      balanceAfter: user.balance,
      tradeRef: trade._id,
      description: `${trade.direction} @ ${trade.entryRate} → ${exitRate} | P&L KES ${pnl >= 0 ? '+' : ''}${pnl}`,
    });

    res.json({
      success: true,
      result: isWin ? 'win' : 'loss',
      pnl,
      newBalance: user.balance,
      trade,
    });
  } catch (err) {
    console.error('Close trade error:', err);
    res.status(500).json({ success: false, message: 'Failed to close trade' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trade/open  — fetch current open trade (if any)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/open', async (req, res) => {
  try {
    const trade = await Trade.findOne({ user: req.user._id, status: 'open' });
    res.json({ success: true, trade: trade || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trade/history  — paginated closed trades
// Query: ?page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [trades, total] = await Promise.all([
      Trade.find({ user: req.user._id, status: { $ne: 'open' } })
        .sort({ closedAt: -1 })
        .skip(skip)
        .limit(limit),
      Trade.countDocuments({ user: req.user._id, status: { $ne: 'open' } }),
    ]);

    res.json({ success: true, trades, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
