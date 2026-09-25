/** The canonical link to a post (reachable by guests; unlisted posts too). */
export function postUrl(postId: string): string {
  return `${window.location.origin}/?mode=post&id=${encodeURIComponent(postId)}`;
}

/** Share a post's link through the OS sheet when available, else copy it. */
export async function sharePostLink(post: { id: string; title: string }): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const url = postUrl(post.id);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: post.title, text: `${post.title} — بصائر`, url });
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
