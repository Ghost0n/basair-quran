import { AUTH_ENABLED } from "@/lib/config";

import { LogoutButton } from "./logout-button";

export function AuthTopbar() {
  if (!AUTH_ENABLED) {
    return null;
  }

  return (
    <div className="auth-topbar">
      <div className="auth-topbar-inner">
        <span className="auth-topbar-label">وضع الوصول الخاص</span>
        <LogoutButton />
      </div>
    </div>
  );
}
