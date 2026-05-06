import { Suspense } from "react";

import { LoginPageShell } from "@/features/auth/login-page-shell";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageShell />
    </Suspense>
  );
}
