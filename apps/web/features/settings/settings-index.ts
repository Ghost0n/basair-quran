type Span = { left: number; width: number };

/**
 * How far the settings' chip row scrolls sideways to bring a chip to its
 * middle: a relative distance, the same in right-to-left and left-to-right
 * interfaces (the row's own scrollLeft runs negative in right-to-left).
 */
export function chipCentringDelta(row: Span, chip: Span): number {
  return chip.left + chip.width / 2 - (row.left + row.width / 2);
}
