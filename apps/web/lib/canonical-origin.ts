/**
 * One address for the local site. The browser keeps storage (the AI key, the
 * language, accepted notices) per origin, and signing in or out always comes
 * back to the configured address (`QBASAIR_PUBLIC_URL`, the same as
 * `NEXT_PUBLIC_SITE_URL`). Browsing at `127.0.0.1:3000` while that address is
 * `localhost:3000` therefore lost everything at each sign-in or sign-out. A
 * page opened at the other loopback name moves to the configured one.
 *
 * Done by the page's first inline script (app/layout.tsx), not the Next proxy:
 * Next treats localhost and 127.0.0.1 as one origin and turns such a redirect
 * back into the address asked, a loop. A public site gets no script at all.
 */
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

const SCRIPT_UNSAFE: Record<string, string> = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * JSON for an inline `<script>`: JSON.stringify alone lets `</script>` close
 * the tag and U+2028/U+2029 end a line, so these come out as `\uXXXX` escapes,
 * which read back as the same string.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>/\u2028\u2029]/g, (ch) => SCRIPT_UNSAFE[ch] ?? ch);
}

export function canonicalOriginScript(siteUrl: string | undefined): string {
  if (!siteUrl) return "";
  let site: URL;
  try {
    site = new URL(siteUrl);
  } catch {
    return "";
  }
  // Only a plain local address gets a script: a loopback host, http(s), and a
  // port that is digits (or none).
  if (!LOOPBACK.includes(site.hostname)) return "";
  if (site.protocol !== "http:" && site.protocol !== "https:") return "";
  if (!/^\d*$/.test(site.port)) return "";
  const wanted = scriptJson({ origin: site.origin, host: site.hostname, port: site.port });
  const names = scriptJson(LOOPBACK);
  return `(function(){try{var w=${wanted},l=${names},h=location.hostname;if(h!==w.host&&l.indexOf(h)>=0&&location.port===w.port){location.replace(w.origin+location.pathname+location.search+location.hash);}}catch(e){}})();`;
}
