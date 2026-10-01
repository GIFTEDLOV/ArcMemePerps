# Frontend/backend contract

The future frontend consumes versioned canonical API responses and realtime events. It may display `MarketPassport`, qualification, execution-gate reasons, position/PnL, health, attention, notifications, profiles, watchlists, and competition projections.

It must not derive qualification, liquidation eligibility, oracle validity, canonical PnL, lifecycle, unavailable evidence, competition scores, or system health. It must not act as keeper. Contract/indexer state is authoritative over browser cache after restart.
