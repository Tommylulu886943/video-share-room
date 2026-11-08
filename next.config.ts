import path from "node:path";
import type { NextConfig } from "next";

// A stray package-lock.json in the parent folder makes Next infer the wrong
// workspace root (routes under /api/t/* then 404 in `next dev`); pin it here.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
