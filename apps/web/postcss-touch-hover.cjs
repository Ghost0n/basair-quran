/**
 * Hover only where there is a pointer that hovers.
 *
 * Touch screens emulate `:hover`: iOS keeps it on the last element the finger
 * touched (or slid over) until something else is tapped, so a tapped Quran
 * word stayed gold and a brushed button stayed lit — the "web page on a
 * phone" feel. Every rule whose selector uses `:hover` is moved into
 * `@media (hover: hover)`; on phones those states simply never apply and the
 * press feedback comes from `:active` instead. Rules already inside a hover
 * media query are left alone.
 */
const QUERY = "(hover: hover)";

function insideHoverQuery(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "atrule" && parent.name === "media" && /\(\s*hover\s*:\s*hover\s*\)/.test(parent.params)) return true;
  }
  return false;
}

/** @type {import('postcss').PluginCreator} */
module.exports = () => ({
  postcssPlugin: "q-basair-touch-hover",
  Rule(rule, { AtRule }) {
    if (!rule.selector.includes(":hover") || insideHoverQuery(rule)) return;
    // Keyframe steps are rules too, but never carry :hover.
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    const hovering = rule.selectors.filter((selector) => selector.includes(":hover"));
    const others = rule.selectors.filter((selector) => !selector.includes(":hover"));
    const wrapper = new AtRule({ name: "media", params: QUERY });
    if (others.length === 0) {
      rule.replaceWith(wrapper);
      wrapper.append(rule);
      return;
    }
    // A mixed list (`.a:hover, .a.on`): the non-hover selectors keep the rule.
    const copy = rule.clone({ selectors: hovering });
    rule.selectors = others;
    wrapper.append(copy);
    rule.after(wrapper);
  },
});
module.exports.postcss = true;
