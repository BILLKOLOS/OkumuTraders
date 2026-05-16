const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const { requestWithdrawal } = require('../services/walletService');
const { getPaystackService } = require('../services/paystackService');
const { creditDeposit } = require('../services/walletService');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (req.query.type && req.query.type !== 'all') {
      filter.type = req.query.type;
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('tradeRef', 'direction entryRate exitRate pnl'),
      Transaction.countDocuments(filter),
    ]);

    const user = req.user;
    res.json({
      success: true,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
      summary: {
        totalDeposits: user.totalDeposits,
        totalWithdrawals: user.totalWithdrawals,
        totalWinnings: user.totalWinnings,
        totalLosses: user.totalLosses,
        currentBalance: user.balance,
      },
    });
  } catch (err) {
    console.error('Transactions fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** Legacy: verify deposit via Paystack reference (prefer GET /payments/paystack/verify/:ref) */
router.post('/deposit/verify', async (req, res) => {
  try {
    const { paystackRef } = req.body;
    if (!paystackRef) {
      return res.status(400).json({ success: false, message: 'paystackRef required' });
    }

    const paystack = getPaystackService();
    const result = await paystack.verifyPayment(paystackRef);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.status === 'pending' ? 'Payment still pending' : 'Payment not successful',
        status: result.status,
      });
    }

    const amountKes = paystack.fromSmallestUnit(result.amountKobo);
    const { user } = await creditDeposit(req.user._id, paystackRef, amountKes);

    res.json({ success: true, newBalance: user.balance, message: 'Deposit successful' });
  } catch (err) {
    console.error('Deposit verify error:', err);
    res.status(500).json({ success: false, message: err.message || 'Deposit processing failed' });
  }
});

router.post('/withdrawal/request', async (req, res) => {
  try {
    const { amount } = req.body;
    const { user, transaction } = await requestWithdrawal(req.user._id, amount);

    res.json({
      success: true,
      newBalance: user.balance,
      transaction,
      message:
        'Withdrawal requested. Funds are reserved; M-Pesa payout is processed weekly (Paystack ~3 business days).',
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
