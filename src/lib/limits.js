/**
 * App-wide amount limits (KES). Edit here for test vs production.
 *
 * Production: MIN_DEPOSIT_KES 200, MIN_TRADE_KES 200, MIN_WITHDRAWAL_KES 500
 */
export const MIN_DEPOSIT_KES = 1;
export const MIN_WITHDRAWAL_KES = 1;
export const MIN_TRADE_KES = 1;

/** Deposit modal quick-pick amounts (not minimums). */
export const DEPOSIT_PRESETS = [1, 50, 100, 200, 500];

/** Trade panel quick-pick amounts (not minimums). */
export const TRADE_PRESETS = [1, 50, 100, 200];
