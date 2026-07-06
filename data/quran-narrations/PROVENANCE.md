# Quran narration (riwāyah) data

These per-riwāyah JSON files were relocated here from the repository root
directory `quran narrations/` (which had a space in its name) during the
Phase-0 repo-cleanup pass. **Only the location changed — contents are byte-for-byte
identical** (moved with `git mv`, so history is preserved).

Files (one per riwāyah / recitation transmission):

| File | Riwāyah |
|---|---|
| `hafs.json`   | Ḥafṣ ʿan ʿĀṣim |
| `warsh.json`  | Warsh ʿan Nāfiʿ |
| `qaloun.json` | Qālūn ʿan Nāfiʿ |
| `douri.json`  | al-Dūrī ʿan Abī ʿAmr |
| `sousi.json`  | al-Sūsī ʿan Abī ʿAmr |
| `shuba.json`  | Shuʿba ʿan ʿĀṣim |

They are reference/source corpora (not generated artifacts). No application code
references them by path at the time of the move; keep this note with them so their
origin and the rename are traceable.
