# CLUSTER browser verification report

**Run date:** 2026-10-28
**Command:** `pnpm e2e`
**Result:** **14 passed, 0 failed** (7 checks each in desktop Chromium and mobile Chromium projects).

## Coverage

- Landing availability text does not claim live qualification or trading.
- Missing market metrics remain unavailable and the trade control is disabled.
- LP deposit controls are disabled; no APY or client-only successful deposit is shown.
- Legacy browser email-session data cannot authenticate a wallet.
- Token import rejects an address when Arc RPC returns no contract bytecode.
- Mobile market detail has no horizontal overflow and keeps trading disabled.
- The disabled trade path never calls wallet send/sign methods.

API, protocol status, stream, and market records in this run were route-mocked with explicitly labeled test fixtures. This is a deterministic client regression report; it is not production API, SSE, RPC, contract, or transaction evidence. Production endpoint results are recorded in [CLUSTER_FINAL_AUDIT.md](CLUSTER_FINAL_AUDIT.md).

## Screenshots

- `evidence/e2e/screenshots/landing-availability-desktop.png`
- `evidence/e2e/screenshots/landing-availability-mobile.png`
- `evidence/e2e/screenshots/trade-unavailable-desktop.png`
- `evidence/e2e/screenshots/trade-unavailable-mobile.png`
- `evidence/e2e/screenshots/lp-deposits-unavailable-desktop.png`
- `evidence/e2e/screenshots/lp-deposits-unavailable-mobile.png`
- `evidence/e2e/screenshots/mobile-trade-unavailable-desktop.png`
- `evidence/e2e/screenshots/mobile-trade-unavailable-mobile.png`

The HTML Playwright report is available under `evidence/e2e/playwright-report/`.
