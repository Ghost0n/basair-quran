import type { MushafItem } from "@q-basair/shared";

/**
 * Ḥafṣ is the default riwāyah: it is the most widely read and the only one with
 * the authentic Madani (QCF) reader. The id is fixed by `scripts/build_db.py`.
 */
export const DEFAULT_MUSHAF_ID = 2;

/**
 * Device-local riwāyah choice. Renamed from the legacy `selectedMushaf` key,
 * which was written on every visit (not only on an explicit choice) and pinned
 * everyone to the old Qālūn default — the new key lets them fall back to Ḥafṣ.
 */
export const MUSHAF_STORAGE_KEY = "qb.selectedMushaf";

/** The default mushaf from a loaded catalog: Ḥafṣ by riwāyah key, else the first. */
export function pickDefaultMushaf(items: MushafItem[]): number {
  return (
    items.find((item) => item.riwayah === "hafs")?.id ??
    items.find((item) => item.id === DEFAULT_MUSHAF_ID)?.id ??
    items[0]?.id ??
    DEFAULT_MUSHAF_ID
  );
}
