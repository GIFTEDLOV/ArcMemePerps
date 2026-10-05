# Three-minute judge walkthrough

1. Open the landing page and read the thesis: discover meme markets, qualify them with evidence, and trade Arc USDC perps only when eligible.
2. Open Terminal and search the live Product market by exact market ID.
3. Open the market passport. The page separates lifecycle, qualification, oracle freshness, depth, holder/deployer evidence, and unavailable external enrichment.
4. Open Proof / Security. Product Testnet is shown as healthy; the separate Stress/Security deployment shows the same frozen source reaching terminal `solvencyBlocked=true` with explicit bad debt.
5. Open the trade rail. The current stale oracle is visible and risk-increasing review is disabled rather than pretending a price is safe.
6. Read system status. Oracle and realtime freshness are independently visible, while database, RPC, indexer, vault, and insurance remain separately reported.

Verdict: the product thesis, evidence model, deployment separation, and signing safety are understandable within three minutes. The honest live blocker is the stale Product oracle observation and the absence of public backend hosting; neither is hidden in the UI.
