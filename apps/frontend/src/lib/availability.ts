/** Independent release switches: do not open one when the other release gate passes. */
// Trade execution needs its own qualified-market, oracle, wallet, and receipt-path sign-off.
export const TRADING_ENABLED = false;
// LP deposits need their own live-vault state and deposit-receipt sign-off.
export const LP_DEPOSITS_ENABLED = false;
export const UNAVAILABLE_REASON = "No qualified live Arc market or verified write/receipt path is currently available.";
