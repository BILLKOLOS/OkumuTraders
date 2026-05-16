const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ── Helper: sign JWT ──────────────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Body: { username, email, phoneNumber, password, confirmPassword }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, phoneNumber, password, confirmPassword } = req.body;

    // ── Basic validation ──────────────────────────────────────────────────────
    if (!username || !email || !phoneNumber || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    if (username.length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
    }

    // ── Check duplicates ──────────────────────────────────────────────────────
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const existingUsername = await User.findOne({ username: username.trim() });
    if (existingUsername) {
      return res.status(409).json({ success: false, message: 'Username already taken' });
    }

    // ── Normalise phone & check duplicate ─────────────────────────────────────
    let normPhone = phoneNumber.replace(/\s+/g, '');
    if (normPhone.startsWith('+')) normPhone = normPhone.slice(1);
    if (normPhone.startsWith('0')) normPhone = '254' + normPhone.slice(1);

    const existingPhone = await User.findOne({ phoneNumber: normPhone });
    if (existingPhone) {
      return res.status(409).json({ success: false, message: 'Phone number already registered' });
    }

    // ── Create user ───────────────────────────────────────────────────────────
    const user = await User.create({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      phoneNumber,        // pre-save hook normalises this
      password,           // pre-save hook hashes this
    });

    const token = signToken(user._id);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: user.toPublicProfile(),
    });
  } catch (err) {
    // Mongoose duplicate key error
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ success: false, message: `${field} already in use` });
    }
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { identifier, password }
// identifier = email OR username OR phone number
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Identifier and password are required' });
    }

    // ── Find user by email / username / phone ─────────────────────────────────
    let normIdentifier = identifier.trim();
    // If looks like a phone, normalise it
    if (/^[0-9+]+$/.test(normIdentifier)) {
      if (normIdentifier.startsWith('+')) normIdentifier = normIdentifier.slice(1);
      if (normIdentifier.startsWith('0')) normIdentifier = '254' + normIdentifier.slice(1);
    }

    const user = await User.findOne({
      $or: [
        { email: normIdentifier.toLowerCase() },
        { username: normIdentifier },
        { phoneNumber: normIdentifier },
      ],
    }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // ── Update last login ─────────────────────────────────────────────────────
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token,
      user: user.toPublicProfile(),
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me  (token refresh / validate)
// ─────────────────────────────────────────────────────────────────────────────
const { protect } = require('../middleware/auth');

router.get('/me', protect, async (req, res) => {
  return res.json({ success: true, user: req.user.toPublicProfile() });
});

module.exports = router;
