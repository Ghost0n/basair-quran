/**
 * The bottom sheets open right now, newest last. Android's back button closes
 * the top one before it goes back (lib/app-back.ts); each <Sheet> registers
 * itself while it is open (components/sheet.tsx).
 */
const open: (() => void)[] = [];

export const sheetStack = {
  /** Registers a sheet's close; returns the function that unregisters it. */
  push(close: () => void): () => void {
    const entry = () => close();
    open.push(entry);
    return () => {
      const index = open.lastIndexOf(entry);
      if (index >= 0) open.splice(index, 1);
    };
  },
  /** Closes the newest open sheet; false when none is open. */
  closeTop(): boolean {
    const top = open[open.length - 1];
    if (!top) return false;
    top();
    return true;
  },
};
