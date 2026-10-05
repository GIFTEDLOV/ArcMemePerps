# Release environment and hosting boundary

## Browser environment variable names

- `VITE_API_URL` — public backend API origin, including `/api/v1`.

The frontend also compiles the canonical Product deployment identity and addresses from the repository's Product deployment manifest. No secrets or local absolute Windows paths are part of the browser configuration.

## Local run

```text
pnpm backend:live
pnpm frontend:dev
```

For the local preview used in this audit, the browser build was given:

```text
VITE_API_URL=http://127.0.0.1:8787/api/v1
```

## Public release dependency

The current backend is local-only. A public release needs an HTTPS API origin, the Product-scoped indexer process, the canonical database, and a publicly reachable SSE/realtime origin. The hosting plan must also allow read-only CORS and long-lived SSE responses. No fake public URL is configured.

Vercel deployment was not performed. The frontend production build and local preview are structurally ready, but public backend hosting remains an infrastructure dependency.
