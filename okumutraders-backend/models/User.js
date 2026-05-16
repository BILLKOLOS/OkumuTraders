const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      // Accept formats: 07XX, 254XX, +254XX — stored normalised as 254XXXXXXXXX
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // never return password in queries
    },

    // ── Wallet ──────────────────────────────────────────────────────────────
    balance: { type: Number, default: 0, min: 0 },
    totalDeposits: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 },
    totalWinnings: { type: Number, default: 0 },
    totalLosses: { type: Number, default: 0 },

    // ── Withdrawals (weekly — Paystack ~3 business days) ─────────────────────
    lastWithdrawalRequestAt: { type: Date },

    // ── Meta ─────────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// ── Normalise phone before save ──────────────────────────────────────────────
userSchema.pre('save', function (next) {
  if (this.isModified('phoneNumber')) {
    let p = this.phoneNumber.replace(/\s+/g, '');
    if (p.startsWith('+')) p = p.slice(1);
    if (p.startsWith('0')) p = '254' + p.slice(1);
    this.phoneNumber = p;
  }
  next();
});

// ── Hash password before save ─────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Compare password ──────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Safe profile (strips internal fields) ─────────────────────────────────────
userSchema.methods.toPublicProfile = function () {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    phoneNumber: this.phoneNumber,
    balance: this.balance,
    totalDeposits: this.totalDeposits,
    totalWithdrawals: this.totalWithdrawals,
    totalWinnings: this.totalWinnings,
    totalLosses: this.totalLosses,
    lastWithdrawalRequestAt: this.lastWithdrawalRequestAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
