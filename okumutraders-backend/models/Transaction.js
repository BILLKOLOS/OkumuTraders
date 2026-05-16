const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // ── Type ──────────────────────────────────────────────────────────────────
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'trade_win', 'trade_loss'],
      required: true,
    },

    amount: { type: Number, required: true }, // always positive KES
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },

    // ── Trade-specific ────────────────────────────────────────────────────────
    tradeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' },

    // ── Payment gateway (Paystack) ────────────────────────────────────────────
    paystackRef: { type: String }, // Paystack reference / transfer code
    gatewayStatus: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'success',
    },

    description: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed }, // raw Paystack webhook payload etc.
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ paystackRef: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
