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
