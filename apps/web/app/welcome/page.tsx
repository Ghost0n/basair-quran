import { Suspense } from "react";

import { WelcomeFlow } from "@/features/onboarding/welcome-flow";

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeFlow />
    </Suspense>
  );
}
