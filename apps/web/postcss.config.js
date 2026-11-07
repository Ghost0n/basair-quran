/**
 * Next's default PostCSS pipeline (flexbugs fixes + preset-env, as Next
 * configures them when no config exists) plus the touch-hover guard
 * (postcss-touch-hover.cjs). Object form: Next and Vite (vitest) both read it.
 */
module.exports = {
  plugins: {
    "next/dist/compiled/postcss-flexbugs-fixes": {},
    "next/dist/compiled/postcss-preset-env": {
      browsers: ["defaults"],
      autoprefixer: { flexbox: "no-2009" },
      stage: 3,
      features: { "custom-properties": false },
    },
    "./postcss-touch-hover.cjs": {},
  },
};
