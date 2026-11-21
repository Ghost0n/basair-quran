import { useEffect } from "react";

import type { KcContext } from "./KcContext";

type Tag = { type: "module" | "text/javascript"; src?: string; text?: string };

/**
 * Keycloak's own page scripts, as Keycloakify's Template.useInitialize adds them
 * (the menu buttons, the realm's scripts, the auth-session checks), each added
 * once per page and never twice. Keycloakify's hook reloads the whole page when
 * its component mounts again — the account page's tabs redraw in place
 * (inPlace.ts), so the frame mounts again by design. No stylesheets: the theme
 * draws without Keycloak's CSS (doUseDefaultCss is off).
 */
export function useKeycloakScripts(kcContext: KcContext) {
  const { url, scripts } = kcContext;
  const sessionHash = kcContext.authenticationSession?.authSessionIdHash;

  useEffect(() => {
    const tags: Tag[] = [
      { type: "module", src: `${url.resourcesPath}/js/menu-button-links.js` },
      ...(scripts ?? []).map((src): Tag => ({ type: "text/javascript", src })),
      {
        type: "module",
        text: [
          `import { startSessionPolling, checkAuthSession } from "${url.resourcesPath}/js/authChecker.js";`,
          ``,
          `startSessionPolling("${url.ssoLoginInOtherTabsUrl}");`,
          sessionHash === undefined ? "" : `checkAuthSession("${sessionHash}");`,
        ].join("\n"),
      },
    ];
    const present = [...document.scripts];
    for (const tag of tags) {
      const already = present.some((script) => (tag.src ? script.getAttribute("src") === tag.src : script.textContent === tag.text));
      if (already) continue;
      const script = document.createElement("script");
      script.type = tag.type;
      if (tag.src) script.src = tag.src;
      else script.textContent = tag.text ?? "";
      document.head.appendChild(script);
    }
  }, [url.resourcesPath, url.ssoLoginInOtherTabsUrl, scripts, sessionHash]);
}
