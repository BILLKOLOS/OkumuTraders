/**
 * Wallet credits and withdrawal requests (idempotent deposits).
 */

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const {
  MIN_DEPOSIT_KES,
  MIN_WITHDRAWAL_KES,
  WITHDRAWAL_COOLDOWN_MS,
} = require('../constants/payments');

async function creditDeposit(userId, paystackRef, amountKes) {
  const amount = Math.round(Number(amountKes));
  if (!paystackRef || !Number.isFinite(amount) || amount < MIN_DEPOSIT_KES) {
    throw new Error(`Invalid deposit (minimum KES ${MIN_DEPOSIT_KES})`);
  }

  const existing = await Transaction.findOne({ paystackRef });
  if (existing) {
    const user = await User.findById(existing.user);
    return { user, transaction: existing, alreadyProcessed: true };
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const balanceBefore = user.balance;
  user.balance = +(user.balance + amount).toFixed(2);
  user.totalDeposits = +(user.totalDeposits + amount).toFixed(2);
  await user.save({ validateBeforeSave: false });

  const transaction = await Transaction.create({
    user: userId,
    type: 'deposit',
    amount,
    balanceBefore,
    balanceAfter: user.balance,
    paystackRef,
    gatewayStatus: 'success',
    description: `Deposit via Paystack (${paystackRef})`,
  });

  return { user, transaction, alreadyProcessed: false };
}

async function requestWithdrawal(userId, amountKes) {
  const amount = Math.round(Number(amountKes));
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL_KES) {
    throw new Error(`Minimum withdrawal is KES ${MIN_WITHDRAWAL_KES}`);
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  if (user.lastWithdrawalRequestAt) {
    const elapsed = Date.now() - new Date(user.lastWithdrawalRequestAt).getTime();
    if (elapsed < WITHDRAWAL_COOLDOWN_MS) {
      const daysLeft = Math.ceil((WITHDRAWAL_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
      throw new Error(
        `Withdrawals are processed weekly. You can request again in ${daysLeft} day(s). Paystack settles in about 3 business days.`,
      );
    }
  }

  if (user.balance < amount) {
    throw new Error('Insufficient balance');
  }

  const balanceBefore = user.balance;
  user.balance = +(user.balance - amount).toFixed(2);
  user.totalWithdrawals = +(user.totalWithdrawals + amount).toFixed(2);
  user.lastWithdrawalRequestAt = new Date();
  await user.save({ validateBeforeSave: false });

  const transaction = await Transaction.create({
    user: userId,
    type: 'withdrawal',
    amount,
    balanceBefore,
    balanceAfter: user.balance,
    gatewayStatus: 'pending',
    description: `Withdrawal to M-Pesa (${user.phoneNumber}) — weekly batch`,
    meta: { phone: user.phoneNumber, requestedAt: new Date() },
  });

  return { user, transaction };
}

module.exports = { creditDeposit, requestWithdrawal };
