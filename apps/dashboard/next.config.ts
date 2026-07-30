import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Without this, Turbopack's monorepo-root inference can pick the wrong
  // directory in some environments (e.g. Docker builds) and fail to resolve
  // `next` from node_modules. Pin it to the actual workspace root (two
  // levels up: apps/dashboard -> apps -> repo root).
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  // Dev-only: mirrors what Caddy does in prod (proxy /api/* to the api
  // service, stripping the prefix — see infra/caddy/Caddyfile) so the
  // dashboard can always call relative /api/... URLs and the browser never
  // makes a cross-origin request, in dev or prod. In prod this is skipped —
  // Caddy is in front of both services, not Next.js.
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    return [{ source: '/api/:path*', destination: 'http://localhost:3001/:path*' }];
  },
};

export default nextConfig;
