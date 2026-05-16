/** Minimum deposit via Paystack (KES). Production: 200 */
const MIN_DEPOSIT_KES = 1;

/** Minimum withdrawal request (KES). Production: 500 */
const MIN_WITHDRAWAL_KES = 1;

/** One withdrawal request per 7 days (Paystack ~3 business days settlement). */
const WITHDRAWAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = {
  MIN_DEPOSIT_KES,
  MIN_WITHDRAWAL_KES,
  WITHDRAWAL_COOLDOWN_MS,
};
