/**
 * Next's default PostCSS pipeline (flexbugs fixes + preset-env, as Next
 * configures them when no config exists) plus the touch-hover guard
 * (postcss-touch-hover.cjs). Object form: Next and Vite (vitest) both read it.
 */
const path = require("node:path");

module.exports = {
  plugins: {
    "next/dist/compiled/postcss-flexbugs-fixes": {},
    "next/dist/compiled/postcss-preset-env": {
      browsers: ["defaults"],
      autoprefixer: { flexbox: "no-2009" },
      stage: 3,
      features: { "custom-properties": false },
    },
    // An absolute path: Turbopack evaluates this file from its build folder,
    // where "./postcss-touch-hover.cjs" would not resolve.
    [path.join(__dirname, "postcss-touch-hover.cjs")]: {},
  },
};
