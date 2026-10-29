-- Decoded events remain linked to immutable raw receipt identity and cascade on reorg.
CREATE TABLE IF NOT EXISTS arc_decoded_events (
  chain_id integer NOT NULL,
  block_number bigint NOT NULL,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL,
  contract_name text NOT NULL,
  event_name text NOT NULL,
  category text NOT NULL,
  market_id text,
  account text,
  position_id text,
  arguments jsonb NOT NULL,
  decode_version integer NOT NULL,
  PRIMARY KEY (chain_id, block_number, transaction_hash, log_index),
  FOREIGN KEY (chain_id, block_number, transaction_hash, log_index)
    REFERENCES arc_raw_events(chain_id, block_number, transaction_hash, log_index) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS arc_decoded_events_market ON arc_decoded_events(chain_id, market_id, block_number);
CREATE INDEX IF NOT EXISTS arc_decoded_events_account ON arc_decoded_events(chain_id, account, block_number);
CREATE INDEX IF NOT EXISTS arc_decoded_events_category ON arc_decoded_events(chain_id, category, block_number);
