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
};

export default nextConfig;
