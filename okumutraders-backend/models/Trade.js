const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // ── Position ──────────────────────────────────────────────────────────────
    direction: { type: String, enum: ['BUY', 'SELL'], required: true },
    amount: { type: Number, required: true, min: 1 }, // production: min 200

    // ── Rate snapshots ────────────────────────────────────────────────────────
    entryRate: { type: Number, required: true },
    exitRate: { type: Number },

    // ── Outcome ───────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['open', 'closed_win', 'closed_loss'],
      default: 'open',
    },
    pnl: { type: Number, default: 0 }, // positive = profit, negative = loss (absolute KES)

    // ── Timing ───────────────────────────────────────────────────────────────
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    timeframeSeconds: { type: Number, enum: [30, 60, 120, 300], default: 60 },
  },
  { timestamps: true }
);

tradeSchema.index({ user: 1, openedAt: -1 });

module.exports = mongoose.model('Trade', tradeSchema);
