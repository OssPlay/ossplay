# @ossplay/dashboard

The OSSPlay admin dashboard — Next.js + React 19 + Shadcn UI. Org/project/asset/worker-fleet management for a self-hosted OSSPlay instance (see [DESIGN.md](../../DESIGN.md) §4 for UX principles).

## Develop

```sh
bun install
bun run --filter @ossplay/dashboard dev
```

Open [http://localhost:6100](http://localhost:6100).

Shadcn components live in `components/ui` — add more with `bunx shadcn@latest add <component>` from this directory.
