const express = require('express');
const router = express.Router();

// In-memory simulated platform stats (no auth required — public dashboard display)
// These are seeded high and increment gradually via Socket.IO in liveFeed.js
// The GET endpoint returns the current snapshot for initial page load.

const { getPlatformStats } = require('../utils/liveFeed');

// GET /api/stats/platform
router.get('/platform', (req, res) => {
  res.json({ success: true, stats: getPlatformStats() });
});

module.exports = router;
