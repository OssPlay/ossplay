import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
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
	// of both services instead (see infra/caddy/Caddyfile).
};

export default nextConfig;
