/**
 * Paystack service — adapted from LavernAI for OkumuTraders (CommonJS).
 * Cards, M-Pesa STK, verify, webhooks.
 */

const axios = require('axios');
const crypto = require('crypto');

class PaystackService {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY || '';
    this.baseUrl = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
    this.callbackUrl = process.env.PAYSTACK_CALLBACK_URL || '';
    this.webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || '';
    this.currency = process.env.PAYSTACK_CURRENCY || 'KES';
    this.channels = (process.env.PAYSTACK_CHANNELS || 'card,mobile_money,bank_transfer').split(',');

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  getPublicKey() {
    return this.publicKey;
  }

  generateReference(prefix = 'OT') {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${ts}_${rand}`.toUpperCase();
  }

  toSmallestUnit(amountKes) {
    return Math.round(Number(amountKes) * 100);
  }

  fromSmallestUnit(amountKobo) {
    return Math.round(Number(amountKobo)) / 100;
  }

  formatKenyanPhone(phone) {
    let p = String(phone || '').replace(/[\s\-()]/g, '');
    if (p.startsWith('+')) p = p.slice(1);
    if (p.startsWith('0')) p = `254${p.slice(1)}`;
    if (!p.startsWith('254')) p = `254${p}`;
    return `+${p}`;
  }

  async initializePayment({ email, amountKobo, metadata = {}, callbackUrl, channels }) {
    const reference = this.generateReference();
    const payload = {
      email,
      amount: amountKobo,
      currency: this.currency,
      reference,
      callback_url: callbackUrl || this.callbackUrl,
      channels: channels || this.channels,
      metadata: { platform: 'okumutraders', ...metadata },
    };

    const { data } = await this.client.post('/transaction/initialize', payload);
    if (!data.status) {
      throw new Error(data.message || 'Failed to initialize payment');
    }
    return { ...data.data, reference: data.data.reference || reference };
  }

  async chargeMobileMoney(email, amountKobo, phone, metadata = {}) {
    const formattedPhone = this.formatKenyanPhone(phone);
    const reference = this.generateReference();

    const { data } = await this.client.post('/charge', {
      email,
      amount: amountKobo,
      currency: this.currency,
      reference,
      mobile_money: { phone: formattedPhone, provider: 'mpesa' },
      metadata: { platform: 'okumutraders', phone: formattedPhone, ...metadata },
    });

    if (!data.status) {
      throw new Error(data.message || 'M-Pesa charge failed');
    }

    const d = data.data;
    const paystackRef = d.reference || reference;
    const pending = d.status === 'pending' || d.status === 'send_otp';

    return {
      success: pending || d.status === 'success',
      reference: paystackRef,
      status: pending ? 'pending' : d.status,
      transactionId: String(d.id || ''),
      amountKobo: d.amount,
      gatewayResponse: d.display_text || d.gateway_response || 'Check your phone to complete payment',
    };
  }

  async verifyPayment(reference) {
    try {
      const { data } = await this.client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (!data.status) {
        return { success: false, status: 'failed', reference, metadata: {} };
      }
      const d = data.data;
      return {
        success: d.status === 'success',
        status: d.status,
        reference: d.reference,
        amountKobo: d.amount,
        channel: d.channel,
        gatewayResponse: d.gateway_response,
        metadata: d.metadata || {},
      };
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'transaction_not_found' || err.response?.status === 404) {
        return { success: false, status: 'pending', reference, metadata: {} };
      }
      throw err;
    }
  }

  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret || !signature) return false;
    const hash = crypto.createHmac('sha512', this.webhookSecret).update(payload).digest('hex');
    return hash === signature;
  }
}

let instance;
function getPaystackService() {
  if (!instance) instance = new PaystackService();
  return instance;
}

module.exports = { PaystackService, getPaystackService };
