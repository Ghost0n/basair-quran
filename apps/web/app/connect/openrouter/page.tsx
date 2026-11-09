import { Suspense } from "react";

import { OpenRouterReturn } from "@/features/settings/openrouter-return";

/** Back from OpenRouter's sign-in (lib/openrouter-signin.ts). */
export default function OpenRouterReturnPage() {
  return (
    <Suspense fallback={null}>
      <OpenRouterReturn />
    </Suspense>
  );
}
