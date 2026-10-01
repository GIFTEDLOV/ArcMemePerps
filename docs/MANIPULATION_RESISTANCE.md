# Manipulation resistance

The estimator reports a conservative range/status, not an exact attack cost. It takes the
minimum directional 1%/2% quote depth, discounts a dominant pool, and considers independent
oracle-source count. A shallow dominant pool is therefore not made safe by large aggregate
liquidity elsewhere.

Statuses are `VERY_LOW`, `LOW`, `MEDIUM`, `HIGH`, `VERY_HIGH`, and `UNAVAILABLE`. A missing
directional quote or missing source independence is unavailable and cannot increase leverage.

The estimator remains a conservative range, not a guaranteed attack-cost proof. Gate 4D feeds it
venue concentration, directional quote depth, and underlying source IDs from the canonical
passport. A market can trend while still receiving low derivatives capacity or a blocked status.
