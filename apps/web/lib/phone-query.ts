/**
 * A phone in either orientation: up to 768px wide, or a short touch screen —
 * a phone on its side is wider than 768px but at most 500px tall. Short
 * windows with a mouse (a resized desktop browser) stay on the desktop layout.
 * Keep in step with the phone CSS (phone-player.css).
 *
 * A plain module (no "use client") so server code — the root layout's
 * before-paint scripts — can read the same query as the client hooks.
 */
export const PHONE_QUERY = "(max-width: 768px), (max-height: 500px) and (pointer: coarse)";
