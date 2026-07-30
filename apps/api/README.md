# @ossplay/api

The OSSPlay backend API — Hono on Bun. Handles uploads, RBAC, presigned URLs, and SSH worker orchestration (see [ARCHITECTURE.md](../../ARCHITECTURE.md) §3).

## Develop

```sh
bun install
bun run --filter @ossplay/api dev
```

Requires `DATABASE_URL` (see `packages/db`). Health check at `GET /health`.
