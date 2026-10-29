-- Arc Mainnet event journal. Apply before starting the worker; no financial writes.
CREATE TABLE IF NOT EXISTS arc_index_ranges (
  chain_id integer NOT NULL CHECK (chain_id = 5042),
  from_block bigint NOT NULL,
  to_block bigint NOT NULL CHECK (to_block >= from_block),
  from_hash text NOT NULL CHECK (from_hash ~ '^0x[0-9a-f]{64}$'),
  to_hash text NOT NULL CHECK (to_hash ~ '^0x[0-9a-f]{64}$'),
  event_count integer NOT NULL CHECK (event_count >= 0),
  source_count smallint NOT NULL CHECK (source_count BETWEEN 1 AND 2),
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, from_block)
);
CREATE UNIQUE INDEX IF NOT EXISTS arc_index_ranges_end ON arc_index_ranges(chain_id, to_block);

CREATE TABLE IF NOT EXISTS arc_raw_events (
  chain_id integer NOT NULL CHECK (chain_id = 5042),
  block_number bigint NOT NULL,
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_index integer NOT NULL,
  log_index integer NOT NULL,
  emitter text NOT NULL CHECK (emitter ~ '^0x[0-9a-f]{40}$'),
  topic0 text NOT NULL CHECK (topic0 ~ '^0x[0-9a-f]{64}$'),
  topics jsonb NOT NULL,
  data text NOT NULL CHECK (data ~ '^0x([0-9a-f]{2})*$'),
  decode_version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (chain_id, block_number, transaction_hash, log_index)
);
CREATE INDEX IF NOT EXISTS arc_raw_events_emitter ON arc_raw_events(chain_id, emitter, block_number);
CREATE INDEX IF NOT EXISTS arc_raw_events_topic ON arc_raw_events(chain_id, topic0, block_number);

CREATE TABLE IF NOT EXISTS arc_index_checkpoint (
  chain_id integer PRIMARY KEY CHECK (chain_id = 5042),
  deployment_start bigint NOT NULL,
  block_number bigint NOT NULL,
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  source_count smallint NOT NULL CHECK (source_count BETWEEN 1 AND 2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arc_event_outbox (
  id bigserial PRIMARY KEY,
  chain_id integer NOT NULL CHECK (chain_id = 5042),
  block_number bigint NOT NULL,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE (chain_id, block_number, transaction_hash, log_index),
  FOREIGN KEY (chain_id, block_number, transaction_hash, log_index)
    REFERENCES arc_raw_events(chain_id, block_number, transaction_hash, log_index) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS arc_event_outbox_block ON arc_event_outbox(chain_id, block_number);
