type Span = { left: number; width: number };

/**
 * How far the settings' chip row scrolls sideways to bring a chip to its
 * middle: a relative distance, the same in right-to-left and left-to-right
 * interfaces (the row's own scrollLeft runs negative in right-to-left).
 */
export function chipCentringDelta(row: Span, chip: Span): number {
  return chip.left + chip.width / 2 - (row.left + row.width / 2);
}

/**
 * Where the row scrolls to: its current place moved by `delta`, kept inside
 * its range — [0, max] left to right, [-max, 0] right to left (scrollLeft
 * runs negative there).
 */
export function chipScrollTarget(current: number, delta: number, max: number, rtl: boolean): number {
  const target = current + delta;
  return rtl ? Math.min(0, Math.max(-max, target)) : Math.max(0, Math.min(max, target));
}
