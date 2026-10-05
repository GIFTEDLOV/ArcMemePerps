# Frontend security and truthfulness audit

- No `dangerouslySetInnerHTML`, `window.open`, private-key handling, mnemonic handling, or browser wallet secret storage was found in frontend runtime code.
- Local storage contains only the selected display wallet address for UI recovery; it is not a signer or credential.
- Wallet writes are initiated through the injected provider after chain/account checks. The browser wallet is not represented as deployer, reporter, keeper, or insurance authority.
- Product client configuration imports `evidence/gate4i/product-deployment.json`. Stress data is imported only for the proof/security page. Product market reads and future client writes cannot default to Stress addresses.
- Pre-trade review captures a snapshot and revalidates oracle freshness and plan data before allowing the signing step. The stale-oracle state blocks risk-increasing review.
- Token metadata is rendered as inert bounded text. No untrusted HTML or unsafe `javascript:`/`data:` navigation path is used by the product surface.
- Search found no `Math.random` synthetic series and no fake chart generation. `Date.now` is used only for freshness evaluation, not to invent market history.
- API CORS is limited to read-only `GET, OPTIONS`; no browser write route was opened by the Gate 6 CORS fix.

Hostile metadata cases (long names/symbols, Unicode controls, HTML-looking strings, unsafe schemes, malformed URLs, and broken images) are classified as safe for the current surface because these fields are displayed as inert text and no dynamic image/link renderer is enabled. They remain explicit unavailable data rather than fabricated replacements.
