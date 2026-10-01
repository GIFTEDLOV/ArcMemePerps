# Canonical MarketPassport

`MarketPassportSchema` in `packages/domain/src/passport.ts` is the versioned read model consumed by risk, API, workers, notifications, competitions, and a future frontend. It extends the strict `MarketSnapshot` schema with pools, LP control, first buyers, bundle evidence, deployer/funding evidence, organic activity, market depth, source independence, Arc market state, and provider health.

Provider-specific records remain evidence inputs. Consumers do not reconstruct security or lifecycle facts from DexScreener, RPC, or optional vendor payloads independently. Missing or unavailable sections remain explicit and cannot become a pass.
