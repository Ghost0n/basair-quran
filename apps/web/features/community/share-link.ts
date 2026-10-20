import { nativeShareLink } from "@/lib/native-share";
import { publicOrigin } from "@/lib/site";

import { t } from "@/lib/i18n";

/**
 * The canonical link to a post (reachable by guests; unlisted posts too), on
 * the public site even when shared from the standalone app; null when the app
 * knows no public address.
 */
export function postUrl(postId: string): string | null {
  const origin = publicOrigin();
  return origin ? `${origin}/?mode=post&id=${encodeURIComponent(postId)}` : null;
}

/** Share a post's link through the OS sheet when available, else copy it. */
export async function sharePostLink(post: { id: string; title: string }): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const url = postUrl(post.id);
  if (!url) return "failed";
  const text = t("{0} — بصائر", { 0: post.title });
  try {
    const native = await nativeShareLink(post.title, text, url);
    if (native) return native === "shared" ? "shared" : "cancelled";
  } catch {
    /* the sheet failed — fall back to copying */
  }
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: post.title, text, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      /* share unavailable for this payload — fall back to copying */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
