# ArcMemePerps microgrant submission package

Prepared locally in Phase 13C. Missing external identifiers remain explicit
placeholders; Mainnet funding is externally blocked, so no Mainnet deployment
or public submission was performed.

## Project

- **Project name:** ArcMemePerps
- **Short description:** Fail-closed multichain meme-market discovery and
  evidence-gated perpetuals settled in Arc USDC.
- **Problem:** Meme markets are abundant, but market visibility, token
  integrity, executable liquidity, and derivatives capacity are often mixed
  together. Users need discovery without silently turning incomplete evidence
  into leverage.
- **Arc use:** Arc provides the USDC-native settlement, vault, oracle,
  qualification, keeper, liquidation, insurance, ADL, and timelocked protocol
  execution layer.

## Architecture

Origin-chain discovery and evidence readers feed a durable market universe.
The 0.4.0 risk engine separates core token safety, surveillance, evidence
coverage, and dynamic derivatives capacity. Only a market with core integrity,
independent oracle sources, executable capacity, and a fresh proof can be
activated on Arc.

## Current status

- Observed/discovered real markets: **262**.
- Core-qualified real markets: **0**.
- Derivatives-eligible real markets: **0**.
- Currently activated real perps: **0**.
- Registered real Arc perp markets: **0**.
- Live real Arc perp markets: **0**.

This zero-market state is intentional. Discovery is useful while activation
remains fail-closed; no canary or famous token is presented as a production
market.

## Links and identifiers

- **Live application URL:** `https://arcmemeperps.vercel.app`
- **GitHub URL:** `https://github.com/GIFTEDLOV/ArcMemePerps`
- **Mainnet contract addresses:** `TBD_AFTER_FRESH_MAINNET_DEPLOYMENT`
- **Builder profile:** `TBD_BUILDER_PROFILE`
- **USDC payout wallet:** `TBD_USDC_PAYOUT_WALLET`
- **Frozen contract source SHA:** `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`
- **Mainnet deployment status:** `PENDING FUNDING / DEPLOYMENT CEREMONY`

## Differentiators

- Discovery is separated from qualification and activation.
- Evidence coverage is displayed instead of averaged into a safety score.
- Current authority, transfer, LP, holder, cluster, oracle, depth, and
  liquidation controls remain fail-closed.
- Dynamic capacity scales OI, position, and leverage to measured conditions.
- Historical Testnet/local evidence covers order execution, keeper flow,
  liquidation, insurance, bad debt containment, and ADL without pretending it
  is a live Mainnet market.

## Testnet evidence and screenshots

Historical mechanics evidence is recorded in `evidence/gate4*/` and the Arc
Testnet documents. Current winner screenshots are in
`docs/assets/phase10/`. They show the real discovery universe and truthful
zero-live-perp state; they do not show fake positions or production trades.

## Limitations

No real market currently satisfies the complete 0.4.0 activation policy. The
submission must not claim Mainnet contracts, Mainnet positions, user trading,
or a live perp market until those facts are independently evidenced.
