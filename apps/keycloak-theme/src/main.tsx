import { StrictMode, startTransition, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { KcPage, type KcContext } from "./kc.gen";
import { openInPlace, registerInPlace } from "./login/inPlace";

/**
 * The page, redrawn in place when the account page's tabs switch (login/inPlace.ts):
 * a new key per page, so every hook starts from that page's context.
 */
function Root(props: { kcContext: KcContext }) {
  const [page, setPage] = useState({ kcContext: props.kcContext, key: 0 });

  useEffect(() => {
    const unregister = registerInPlace((kcContext) => {
      window.kcContext = kcContext;
      startTransition(() => setPage((current) => ({ kcContext, key: current.key + 1 })));
    });
    // Back and forward between the tabs: the same, without recording; else a plain load.
    const onPopState = () => {
      void openInPlace(window.location.href, false).then((drawn) => {
        if (!drawn) window.location.reload();
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      unregister();
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return <KcPage key={page.key} kcContext={page.kcContext} />;
}

async function main() {
  // `pnpm dev`: a page with mock data, e.g. http://localhost:5173/?page=register.ftl&locale=fr&social
  // (dev only; in Keycloak window.kcContext is always set).
  if (import.meta.env.DEV && !window.kcContext) {
    const { mockContext } = await import("./login/mocks");
    const params = new URLSearchParams(window.location.search);
    window.kcContext = mockContext(params.get("page") ?? "login.ftl", params.get("locale") ?? "ar", params.has("social"));
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>{window.kcContext ? <Root kcContext={window.kcContext} /> : <h1>No Keycloak context</h1>}</StrictMode>,
  );
}

void main();
