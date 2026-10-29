-- Event-derived read models. They are not a substitute for pinned-block state
-- reconciliation or direct USDC token balance verification.
CREATE OR REPLACE VIEW arc_market_projection AS
WITH registered AS (
  SELECT DISTINCT ON (d.market_id) d.market_id,d.arguments AS registration,
    d.block_number,d.transaction_hash,d.log_index
  FROM arc_decoded_events d JOIN arc_raw_events r USING (chain_id,block_number,transaction_hash,log_index)
  WHERE d.chain_id=5042 AND d.contract_name='MarketRegistry' AND d.event_name='MarketRegistered'
  ORDER BY d.market_id,d.block_number DESC,r.transaction_index DESC,d.log_index DESC
), market_state AS (
  SELECT DISTINCT ON (d.market_id) d.market_id,d.event_name,d.arguments
  FROM arc_decoded_events d JOIN arc_raw_events r USING (chain_id,block_number,transaction_hash,log_index)
  WHERE d.chain_id=5042 AND d.contract_name='MarketRegistry' AND d.event_name='MarketStateUpdated'
  ORDER BY d.market_id,d.block_number DESC,r.transaction_index DESC,d.log_index DESC
), lifecycle AS (
  SELECT DISTINCT ON (d.market_id) d.market_id,d.arguments
  FROM arc_decoded_events d JOIN arc_raw_events r USING (chain_id,block_number,transaction_hash,log_index)
  WHERE d.chain_id=5042 AND d.contract_name='MarketRegistry' AND d.event_name='LifecycleUpdated'
  ORDER BY d.market_id,d.block_number DESC,r.transaction_index DESC,d.log_index DESC
), qualification AS (
  SELECT DISTINCT ON (d.market_id) d.market_id,d.event_name,d.arguments
  FROM arc_decoded_events d JOIN arc_raw_events r USING (chain_id,block_number,transaction_hash,log_index)
  WHERE d.chain_id=5042 AND d.contract_name='QualificationRegistry'
    AND d.event_name IN ('QualificationApproved','QualificationRevoked')
  ORDER BY d.market_id,d.block_number DESC,r.transaction_index DESC,d.log_index DESC
), risk AS (
  SELECT DISTINCT ON (d.market_id) d.market_id,d.event_name,d.arguments
  FROM arc_decoded_events d JOIN arc_raw_events r USING (chain_id,block_number,transaction_hash,log_index)
  WHERE d.chain_id=5042 AND d.contract_name='RiskConfig'
    AND d.event_name IN ('RiskConfigInitialized','RiskLimitsReduced','MarketRequalified','MarketStatusUpdated')
  ORDER BY d.market_id,d.block_number DESC,r.transaction_index DESC,d.log_index DESC
), oracle AS (
  SELECT DISTINCT ON (d.market_id) d.market_id,d.event_name,d.arguments
  FROM arc_decoded_events d JOIN arc_raw_events r USING (chain_id,block_number,transaction_hash,log_index)
  WHERE d.chain_id=5042 AND d.contract_name='OracleRouter' AND d.event_name IN ('ReportUpdated','PriceUpdated')
  ORDER BY d.market_id,d.block_number DESC,r.transaction_index DESC,d.log_index DESC
)
SELECT m.market_id,m.registration,m.block_number AS registered_block,
  m.transaction_hash AS registration_tx,m.log_index AS registration_log_index,
  s.arguments AS market_state_event_args,l.arguments AS lifecycle_event_args,
  q.event_name AS qualification_event,q.arguments AS qualification_event_args,
  (q.event_name='QualificationApproved') AS approval_event_latest,
  k.event_name AS risk_event,k.arguments AS risk_event_args,
  o.event_name AS oracle_event,o.arguments AS oracle_event_args,
  'EVENTS_ONLY_REQUIRES_PINNED_STATE_AND_ORACLE_EVIDENCE'::text AS verification_state
FROM registered m LEFT JOIN market_state s USING (market_id)
  LEFT JOIN lifecycle l USING (market_id)
  LEFT JOIN qualification q USING (market_id)
  LEFT JOIN risk k USING (market_id)
  LEFT JOIN oracle o USING (market_id);

CREATE OR REPLACE VIEW arc_position_projection AS
WITH ordered AS (
  SELECT d.position_id,d.event_name,d.arguments,d.block_number,r.transaction_index,d.log_index,
    first_value(d.arguments) OVER (PARTITION BY d.position_id ORDER BY d.block_number,r.transaction_index,d.log_index)
      AS opening_arguments,
    first_value(d.event_name) OVER (PARTITION BY d.position_id ORDER BY d.block_number DESC,r.transaction_index DESC,d.log_index DESC)
      AS last_event
  FROM arc_decoded_events d JOIN arc_raw_events r USING (chain_id,block_number,transaction_hash,log_index)
  WHERE d.chain_id=5042 AND d.contract_name='PerpEngine' AND d.position_id IS NOT NULL
    AND d.event_name IN ('PositionOpened','PositionIncreased','PositionReduced','PositionClosed','PositionLiquidated','ADLPositionReduced')
)
SELECT position_id,(jsonb_agg(opening_arguments)->0) AS opening_arguments,max(last_event) AS last_event,
  CASE WHEN max(last_event) IN ('PositionClosed','PositionLiquidated') THEN 0
    ELSE sum(CASE event_name WHEN 'PositionOpened' THEN (arguments->>'size')::numeric
      WHEN 'PositionIncreased' THEN (arguments->>'sizeAdded')::numeric
      WHEN 'PositionReduced' THEN -(arguments->>'sizeReduced')::numeric
      WHEN 'ADLPositionReduced' THEN -(arguments->>'sizeReduced')::numeric ELSE 0 END) END AS event_derived_size,
  count(*) AS event_count,
  'EVENTS_ONLY_REQUIRES_PINNED_ENGINE_AND_VAULT_PARITY'::text AS verification_state
FROM ordered GROUP BY position_id;

CREATE OR REPLACE VIEW arc_financial_event_totals AS
SELECT contract_name,event_name,count(*) AS event_count,
  sum(COALESCE((arguments->>'amount')::numeric,(arguments->>'assets')::numeric)) AS reported_amount
FROM arc_decoded_events
WHERE chain_id=5042 AND category IN ('CUSTODY','INSURANCE','LP','ADL','TRADE')
GROUP BY contract_name,event_name;
