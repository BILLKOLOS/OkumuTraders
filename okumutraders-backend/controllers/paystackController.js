const { getPaystackService } = require('../services/paystackService');
const { creditDeposit } = require('../services/walletService');
const { MIN_DEPOSIT_KES } = require('../constants/payments');

function getUserEmail(user, bodyEmail) {
  return bodyEmail || user.email || `${user._id}@okumutraders.app`;
}

/** GET /api/payments/paystack/public-key */
exports.getPublicKey = (req, res) => {
  const paystack = getPaystackService();
  res.json({ success: true, data: { publicKey: paystack.getPublicKey() } });
};

/** POST /api/payments/paystack/initialize — card / checkout */
exports.initializePayment = async (req, res) => {
  try {
    const { amount, email, metadata = {}, callbackUrl } = req.body;
    const amountKes = Math.round(Number(amount));
    if (!Number.isFinite(amountKes) || amountKes < MIN_DEPOSIT_KES) {
      return res.status(400).json({
        success: false,
        message: `Minimum deposit is KES ${MIN_DEPOSIT_KES}`,
      });
    }

    const paystack = getPaystackService();
    const data = await paystack.initializePayment({
      email: getUserEmail(req.user, email),
      amountKobo: paystack.toSmallestUnit(amountKes),
      callbackUrl,
      metadata: {
        userId: String(req.user._id),
        purpose: 'deposit',
        amountKes,
        ...metadata,
      },
    });

    res.json({
      success: true,
      message: 'Payment initialized',
      data: {
        authorizationUrl: data.authorization_url,
        accessCode: data.access_code,
        reference: data.reference,
        amountKes,
      },
    });
  } catch (err) {
    console.error('Paystack initialize error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Initialize failed' });
  }
};

/** POST /api/payments/paystack/mpesa — STK push */
exports.initiateMpesaPayment = async (req, res) => {
  try {
    const { amount, phone, email, metadata = {} } = req.body;
    const amountKes = Math.round(Number(amount));
    const payPhone = phone || req.user.phoneNumber;

    if (!Number.isFinite(amountKes) || amountKes < MIN_DEPOSIT_KES) {
      return res.status(400).json({
        success: false,
        message: `Minimum deposit is KES ${MIN_DEPOSIT_KES}`,
      });
    }
    if (!payPhone) {
      return res.status(400).json({ success: false, message: 'Phone number required' });
    }

    const paystack = getPaystackService();
    const result = await paystack.chargeMobileMoney(
      getUserEmail(req.user, email),
      paystack.toSmallestUnit(amountKes),
      payPhone,
      {
        userId: String(req.user._id),
        purpose: 'deposit',
        amountKes,
        ...metadata,
      },
    );

    const stkSent = Boolean(result.reference);
    res.json({
      success: stkSent,
      message: result.gatewayResponse || 'Check your phone to complete the M-Pesa payment',
      data: {
        reference: result.reference,
        status: result.status,
        amountKes,
      },
    });
  } catch (err) {
    console.error('M-Pesa charge error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'M-Pesa failed' });
  }
};

/** GET /api/payments/paystack/verify/:reference */
exports.verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) {
      return res.status(400).json({ success: false, message: 'Reference required' });
    }

    const paystack = getPaystackService();
    const result = await paystack.verifyPayment(reference);

    if (result.success) {
      const amountKes = paystack.fromSmallestUnit(result.amountKobo);
      const metaUserId = result.metadata?.userId;
      const userId = metaUserId && String(metaUserId) === String(req.user._id)
        ? req.user._id
        : req.user._id;

      const { user, alreadyProcessed } = await creditDeposit(userId, reference, amountKes);

      return res.json({
        success: true,
        data: {
          reference,
          status: 'success',
          amount: amountKes,
          newBalance: user.balance,
          alreadyProcessed,
        },
      });
    }

    res.json({
      success: false,
      data: {
        reference,
        status: result.status || 'pending',
        gatewayResponse: result.gatewayResponse,
      },
    });
  } catch (err) {
    console.error('Verify error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Verification failed' });
  }
};

/** POST /api/payments/paystack/webhook */
exports.handleWebhook = async (req, res) => {
  try {
    const paystack = getPaystackService();
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.body;

    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const payload = rawBody.toString('utf8');
    if (!paystack.verifyWebhookSignature(payload, signature)) {
      console.warn('Invalid Paystack webhook signature');
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const event = JSON.parse(payload);
    if (event.event === 'charge.success') {
      const d = event.data;
      const userId = d.metadata?.userId;
      const amountKes = paystack.fromSmallestUnit(d.amount);
      if (userId && d.reference) {
        await creditDeposit(userId, d.reference, amountKes);
        console.log('✅ Webhook deposit credited:', d.reference, amountKes);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).json({ received: true });
  }
};

/** GET /api/payments/paystack/callback */
exports.handleCallback = async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const ref = req.query.reference || req.query.trxref;
  if (!ref) {
    return res.redirect(`${clientUrl}?payment=failed`);
  }
  return res.redirect(`${clientUrl}?payment=verify&ref=${encodeURIComponent(ref)}`);
};
