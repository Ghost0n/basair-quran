/**
 * The web design (Q-Basair-55, docs/design-system.md) is the one design of the
 * app: at every width, in a phone browser and in the native app alike
 * (docs/responsive-design.md). The
 * `qb-web` class stays as the scope of its rules.
 */
export function isWebDesign(): boolean {
  return true;
}

/** Sets `<html class="qb-web">` before first paint. Every rule of the web design is scoped under `.qb-web`. */
export const WEB_DESIGN_INIT_SCRIPT = `(function(){try{document.documentElement.classList.add('qb-web');}catch(e){}})();`;
