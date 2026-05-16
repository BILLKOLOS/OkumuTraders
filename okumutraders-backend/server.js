const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const tradeRoutes = require('./routes/trade');
const transactionRoutes = require('./routes/transaction');
const statsRoutes = require('./routes/stats');
const paystackRoutes = require('./routes/paystack');
const { handleWebhook } = require('./controllers/paystackController');

const { startLiveFeedSimulator } = require('./utils/liveFeed');

const app = express();
const server = http.createServer(app);

const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST'],
  },
});

// Paystack webhook must use raw body for signature verification
app.post(
  '/api/payments/paystack/webhook',
  express.raw({ type: 'application/json' }),
  handleWebhook,
);

app.use(cors({ origin: clientOrigin }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/payments/paystack', paystackRoutes);
app.use('/api/stats', statsRoutes);

app.get('/', (req, res) => {
  res.json({
    service: 'OkumuTraders API',
    status: 'running',
    health: '/api/health',
    docs: 'API routes are under /api/*',
  });
});

app.get('/api/health', (req, res) => res.json({ status: 'OK', ts: Date.now() }));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/okumutraders')
  .then(() => console.log('✅  MongoDB connected'))
  .catch((err) => console.error('MongoDB error:', err));

startLiveFeedSimulator(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀  Server running on port ${PORT}`));

module.exports = { io };
