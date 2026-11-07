import type { MushafEditionId } from "@q-basair/shared";

import { t } from "@/lib/i18n";

/**
 * Mushaf editions — the reader's one "which mushaf" setting (account preference
 * `mushaf_edition`). An edition fixes the riwāyah AND how it is drawn, so the
 * user never picks a riwāyah or a renderer separately.
 *
 * Version 1 ships a single edition: the Madani mushaf (Ḥafṣ, authentic QCF
 * glyph pages). The other riwāyāt stay in the database for later standard
 * editions; to add one, append it here and to `MushafEditionId`.
 */
export type MushafEdition = {
  id: MushafEditionId;
  /** Display name, e.g. in Settings. */
  name: string;
  /** Short line under the name. */
  description: string;
  /** Riwāyah label for compact places (reader footer: «رواية حفص»). */
  shortLabel: string;
  /** Backend mushaf id (fixed by `scripts/build_db.py`). */
  mushafId: number;
  /** Normalized riwāyah key (matches `MushafItem.riwayah` / `ReciterItem.riwayah`). */
  riwayah: string;
  /** Authentic editions draw the printed page with the QCF glyph fonts. */
  authentic: boolean;
};

export const MUSHAF_EDITIONS: readonly MushafEdition[] = [
  {
    id: "madani-hafs",
    get name() {
    return t("مصحف المدينة النبوية");
  },
    get description() {
    return t("رواية حفص عن عاصم · صفحات مجمّع الملك فهد");
  },
    get shortLabel() {
    return t("حفص");
  },
    mushafId: 2,
    riwayah: "hafs",
    authentic: true,
  },
];

export const DEFAULT_EDITION: MushafEdition = MUSHAF_EDITIONS[0];

/** Ḥafṣ: the default edition's mushaf id. */
export const DEFAULT_MUSHAF_ID = DEFAULT_EDITION.mushafId;

/** The edition for a stored preference; unknown or missing ids fall back to the default. */
export function resolveEdition(id: string | null | undefined): MushafEdition {
  return MUSHAF_EDITIONS.find((edition) => edition.id === id) ?? DEFAULT_EDITION;
}
