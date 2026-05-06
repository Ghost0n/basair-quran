import { AuthTopbar } from "@/features/auth/auth-topbar";
import { SearchWorkspaceShell } from "@/components/search-workspace-shell";

export default function HomePage() {
  return (
    <>
      <AuthTopbar />
      <SearchWorkspaceShell />
    </>
  );
}
