import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@web\/(.*)$/, replacement: `${path.resolve(here, "../web")}/$1` },
      { find: /^@\/(.*)$/, replacement: `${path.resolve(here, "../web")}/$1` },
    ],
  },
  test: { environment: "node", include: ["src/**/*.test.ts"], css: false },
});
