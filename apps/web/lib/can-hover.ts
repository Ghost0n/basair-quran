/**
 * True on devices with a mouse or trackpad. Fields only take focus on their own
 * there: on a touch screen focusing pops the keyboard over what the user came
 * to see (they tap the field when they want to type).
 */
export function canHover(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true;
}
