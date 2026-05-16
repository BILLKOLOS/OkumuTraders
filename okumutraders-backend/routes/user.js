const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { protect } = require('../middleware/auth');
const User = require('../models/User');

// All user routes require auth
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/user/profile
// ─────────────────────────────────────────────────────────────────────────────
router.get('/profile', (req, res) => {
  res.json({ success: true, user: req.user.toPublicProfile() });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/user/profile
// Body: { email?, phoneNumber? }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/profile', async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;
    const updates = {};

    if (email) {
      // Check uniqueness
      const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.user._id } });
      if (existing) return res.status(409).json({ success: false, message: 'Email already in use' });
      updates.email = email.toLowerCase().trim();
    }

    if (phoneNumber) {
      let p = phoneNumber.replace(/\s+/g, '');
      if (p.startsWith('+')) p = p.slice(1);
      if (p.startsWith('0')) p = '254' + p.slice(1);
      const existing = await User.findOne({ phoneNumber: p, _id: { $ne: req.user._id } });
      if (existing) return res.status(409).json({ success: false, message: 'Phone number already in use' });
      updates.phoneNumber = p;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, message: 'Profile updated', user: user.toPublicProfile() });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/user/password
// Body: { currentPassword, newPassword }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both fields required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ success: false, message: 'Failed to update password' });
  }
});

module.exports = router;
