-- Run as the schema owner after creating these roles and applying migrations.
-- Do not put passwords or connection strings in this file.
GRANT USAGE ON SCHEMA public TO cluster_arc_indexer, cluster_arc_api_reader;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cluster_arc_indexer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cluster_arc_indexer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cluster_arc_api_reader;

-- Keep later migrations compatible with the same split when run by this owner.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cluster_arc_indexer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cluster_arc_indexer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO cluster_arc_api_reader;
