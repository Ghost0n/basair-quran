/**
 * The bottom sheets open right now, newest last. Android's back button closes
 * the top one before it goes back (lib/app-back.ts); each <Sheet> registers
 * itself while it is open (components/sheet.tsx).
 */
const open: (() => void)[] = [];

export const sheetStack = {
  /** Registers a sheet's close; returns the function that unregisters it. */
  push(close: () => void): () => void {
    open.push(close);
    return () => {
      const index = open.lastIndexOf(close);
      if (index >= 0) open.splice(index, 1);
    };
  },
  /** Whether this close (as registered) belongs to the newest open sheet. */
  isTop(close: () => void): boolean {
    return open.length > 0 && open[open.length - 1] === close;
  },
  /** Closes the newest open sheet; false when none is open. */
  closeTop(): boolean {
    const top = open[open.length - 1];
    if (!top) return false;
    top();
    return true;
  },
};
