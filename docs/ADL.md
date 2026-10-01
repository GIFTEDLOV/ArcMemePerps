# ADL boundary

`ADLController` implements a deterministic, bounded episode: governance opens a deficit budget, candidates are registered with a deterministic score, a keeper consumes each candidate once, and reductions cannot exceed the episode budget or candidate size. State is consumed before the engine callback.

The controller is not yet a complete production ADL policy. Candidate ranking, profit/exposure proofs, partial position accounting, and full vault/insurance reconciliation require integration and additional fuzz/invariant coverage. Automatic ADL remains unavailable for the existing deployment.
