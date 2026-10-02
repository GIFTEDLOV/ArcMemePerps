# ADL boundary

`ADLController` implements a deterministic, bounded last-resort episode:
governance opens a deficit budget, candidates are registered in non-increasing
ranking order with ascending position ID as the deterministic tie-breaker,
every candidate is bound to its episode, a keeper consumes each candidate once,
and reductions cannot exceed the episode budget or candidate size. State is
consumed before the engine callback. The engine returns the
actual positive economic reduction, and the controller decrements the deficit
by that returned amount rather than by the requested position size. The vault
applies the same amount to recorded uncovered bad debt and pending negative
claims. The off-chain selector uses the same deterministic ordering and
considers only profitable exposure; the deficit budget is the hard upper bound.

An active episode cannot be reopened, and a terminalized episode cannot accept
new candidates. `finalize` is valid only at zero remaining deficit. If the
candidate set is insufficient, `finalizeUnresolved` enters the engine's
terminal `solvencyBlocked` state and preserves the residual deficit; it does
not write the deficit off. The engine must provide the deficit budget and
candidate proof, and the vault/insurance reconciliation hooks settle in the
same atomic flow. Automatic ADL is not enabled on the historical deployment;
the changed suite requires a fresh authorized testnet deployment before
operational use.
