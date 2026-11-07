import { redirect } from "next/navigation";

/**
 * The standalone research page has been folded into the Studio panel
 * (Phase 4). This route now redirects into the workspace shell.
 */
export default function ResearchPage() {
  redirect("/?mode=studio");
}
