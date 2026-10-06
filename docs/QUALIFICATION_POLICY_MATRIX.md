# Qualification Policy Matrix

Rule version: `risk-rules/0.2.0`

The matrix is a policy applicability declaration. `NOT_APPLICABLE` is only
valid when the selected versioned profile proves that the threat model does
not expose that gate. Missing evidence is never converted to
`NOT_APPLICABLE`; it remains `UNKNOWN`.

| Security / threat condition | SOLANA_SPL | SOLANA_TOKEN_2022 | EVM_STANDARD | EVM_PROXY | LAUNCHPAD_CONTROLLED | VENUE_SPECIFIC_LP_CONTROL |
| --- | --- | --- | --- | --- | --- | --- |
| Token mint authority / mintability | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| Solana freeze authority | MANDATORY | MANDATORY | NOT_APPLICABLE | NOT_APPLICABLE | MANDATORY | MANDATORY |
| EVM owner/admin privilege | NOT_APPLICABLE | NOT_APPLICABLE | MANDATORY | MANDATORY | NOT_APPLICABLE | MANDATORY |
| Proxy / upgradeability risk | NOT_APPLICABLE | NOT_APPLICABLE | MANDATORY | MANDATORY | NOT_APPLICABLE | MANDATORY |
| Honeypot / transfer restriction | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| LP withdrawal by any actor | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| LP unlock timing / migration control | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| Creator / deployer concentration | WARNING | WARNING | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| Individual holder concentration | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| Connected wallet cluster concentration | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| Bundled launch concentration | WARNING | WARNING | WARNING | WARNING | MANDATORY | MANDATORY |
| Known-risk creator / deployer | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| Related creator / early-buyer funding | WARNING | WARNING | WARNING | WARNING | MANDATORY | MANDATORY |
| Suspicious early buyers | WARNING | WARNING | WARNING | WARNING | MANDATORY | MANDATORY |
| Wash trading | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| Volume farming | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| Suspicious transaction repetition | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |
| Mandatory-evidence completeness | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY | MANDATORY |

## Evidence required for a mandatory gate

| Gate | Evidence required to reach PASS or FAIL |
| --- | --- |
| Token mint authority / mintability | Canonical Solana mint account authority or a direct EVM mintability/role inspection |
| Solana freeze authority | Solana RPC `getAccountInfo` mint read with the owning token program and freeze authority |
| EVM owner/admin privilege | Bytecode, owner, role, and privileged-call inspection from the canonical EVM RPC/provider path |
| Proxy / upgradeability risk | Proxy implementation, proxy admin, upgrade authority, and role inspection |
| Honeypot / transfer restriction | Chain-native transfer simulation or source-backed restriction evidence |
| LP withdrawal / unlock | Venue pool state, LP mint/position state, supply/holder or locker/program custody, and privileged withdrawal authority |
| Creator/deployer concentration | Canonical creator/deployer identity plus holder ownership resolution |
| Individual holder concentration | Largest token accounts and proven owner resolution; unresolved accounts remain included |
| Connected cluster concentration | Underlying wallet relationships with a supply denominator; aggregate provider scores are insufficient |
| Bundled launch concentration | Bounded launch-window transactions, same-slot buyers, and bundle concentration |
| Known-risk creator/deployer | Completed documented check against the available risk corpus and required historical outcomes |
| Related funding | Bounded creator/early-buyer transaction history with evidenced shared funding relationships |
| Suspicious early buyers | Bounded launch-window buyer, sniper, same-slot, and bundle analysis |
| Wash/farming/repetition | A completed observed trade window from venue transactions, GeckoTerminal history, or canonical RPC logs |
| Mandatory-evidence completeness | Every mandatory applicable gate above has a PASS/FAIL-capable source result |

## Historical-launch rationale

The launch-window rows are mandatory for `LAUNCHPAD_CONTROLLED` because the
launch mechanism is part of that profile's safety invariant. For established
pre-existing markets under the mature SPL or EVM profiles, the original launch
window may no longer be recoverable. The audited policy therefore treats those
rows as warnings: they remain visible and are never represented as CLEAR, but
they do not block qualification when the current holder, creator-risk,
liquidity-control, and observed-activity invariants are complete. This is a
policy distinction, not a result-driven threshold change.

`VENUE_SPECIFIC_LP_CONTROL` is intentionally strict and declares no gate
non-applicable. It is an LP-control overlay and does not, by itself, prove that
any chain authority or launch threat is absent.
