import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const apiOrigin = process.env.QBASAIR_API_ORIGIN ?? "http://127.0.0.1:8001";
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const standaloneOutput = process.env.NEXT_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(standaloneOutput
    ? {
        output: "standalone" as const,
        outputFileTracingRoot: workspaceRoot,
      }
    : {}),
  // Glyph/Quran fonts live under versioned paths (e.g. /fonts/qpc-hafs-v1/p50.woff2)
  // and never change in place — cache them for a year instead of Next's default
  // max-age=0, which revalidated every one of the 604 page fonts on each visit.
  async headers() {
    return [
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
