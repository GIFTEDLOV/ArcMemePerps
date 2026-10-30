-- Reorg invalidations survive event-row deletion and share one monotonic SSE ID space.
CREATE TABLE IF NOT EXISTS arc_reorg_notices (
  id bigint PRIMARY KEY DEFAULT nextval('arc_event_outbox_id_seq'),
  chain_id integer NOT NULL CHECK (chain_id = 5042),
  from_block bigint NOT NULL,
  previous_through bigint NOT NULL,
  previous_checkpoint_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arc_reorg_notices_chain_id_id ON arc_reorg_notices(chain_id,id);
