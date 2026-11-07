/**
 * Build-time feature flags. `NEXT_PUBLIC_*` values are inlined when the app is
 * built, so a flag left off removes its feature from the web build and from
 * the app bundle (apps/mobile wraps apps/web/out) alike.
 */

/**
 * «قراءة تفسيرية» — the experimental explanatory reading in Study. Off in v1:
 * Study answers from the Quran alone and offers no mode, depth or setting for
 * it. The backend keeps the feature; build with `NEXT_PUBLIC_QB_TAFSSIR=1` to
 * bring the interface back. Content already made in that mode still shows
 * with its disclaimer.
 */
export const TAFSSIR_ENABLED = process.env.NEXT_PUBLIC_QB_TAFSSIR === "1";

/** The study mode a new turn may use: the explanatory reading only when built in. */
export function allowedStudyMode<M extends string>(mode: M): M | "strict" {
  return TAFSSIR_ENABLED ? mode : "strict";
}
