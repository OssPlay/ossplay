import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	// Next's built-in gzip compression wraps every response this server
	// sends, including proxy.ts's dev-only /api/* rewrite — a compressor has
	// to buffer enough bytes before it can flush a chunk, which silently
	// breaks a long-lived streamed response (an SSE connection, e.g.
	// apps/api/src/routes/events.ts) that never accumulates enough data to
	// trigger a flush: the browser sees nothing until the connection
	// eventually closes. Only disabled in dev, where that rewrite exists —
	// production never runs this branch (Caddy reverse-proxies /api/*
	// straight to the api service, see proxy.ts's own comment), so this has
	// no effect on production's page/asset compression.
	compress: process.env.NODE_ENV === "production",
	// Without this, Turbopack's monorepo-root inference can pick the wrong
	// directory in some environments (e.g. Docker builds) and fail to resolve
	// `next` from node_modules. Pin it to the actual workspace root (two
	// levels up: apps/dashboard -> apps -> repo root).
	turbopack: {
		root: path.join(__dirname, "../.."),
	},
	// The dev-only /api/* proxy to the api service lives in proxy.ts, not
	// here — it needs to set X-Forwarded-Host so email links built from the
	// request (invite/reset) point at the dashboard's origin, and rewrite()
	// destinations here can't carry custom headers. In prod Caddy is in front
	// of both services instead (see infra/caddy/Caddyfile), which has no
	// body-size cap of its own — this app has no max upload size by design
	// (LocalDiskStorage/S3 both stream arbitrarily large files), so the only
	// place a limit was ever actually being enforced was this proxy's default
	// 10MB, silently truncating any upload larger than that in dev. Raised
	// well past any real file this product expects to move.
	experimental: {
		proxyClientMaxBodySize: "5gb",
	},
};

export default nextConfig;
