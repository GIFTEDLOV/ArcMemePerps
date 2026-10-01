# ADL boundary

`ADLController` implements a deterministic, bounded last-resort episode:
governance opens a deficit budget, candidates are registered in non-increasing
ranking order, every candidate is bound to its episode, a keeper consumes each
candidate once, and reductions cannot exceed the episode budget or candidate
size. State is consumed before the engine callback. The off-chain selector
uses the same deterministic ordering and considers only profitable exposure;
the deficit budget is the hard upper bound.

The controller is a deterministic last-resort boundary for the changed suite. The engine must
provide the deficit budget and candidate proof, and the vault/insurance reconciliation hooks must
be settled in the same atomic flow. Automatic ADL is not enabled on the historical deployment;
the changed suite requires a fresh authorized testnet deployment before operational use.
