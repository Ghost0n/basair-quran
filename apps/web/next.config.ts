import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const apiOrigin = process.env.QBASAIR_API_ORIGIN ?? "http://127.0.0.1:8001";
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const standaloneOutput = process.env.NEXT_STANDALONE === "1";

const webConfig: NextConfig = {
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
      // Except the Noto stylesheets (/fonts/noto/<script>.css): their names stay
      // the same when a rebuild picks up a new font version (the font files
      // themselves sit under versioned paths). The later rule wins.
      {
        source: "/fonts/noto/:file([^/]+\\.css)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
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

// The standalone (Android) app: a static export (`out/`) served from the
// device, with /api answered on the device (lib/app-mode). There is no server,
// so no rewrites, headers or middleware (".tsx" pages only leaves middleware.ts out).
const appConfig: NextConfig = {
  output: "export",
  pageExtensions: ["app.tsx", "tsx", "ts", "jsx", "js"],
  images: { unoptimized: true },
  distDir: "out",
};

export default process.env.NEXT_PUBLIC_APP_MODE === "1" ? appConfig : webConfig;
