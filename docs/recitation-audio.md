# Recitation audio

Status: in place — the preparation pipeline and its routes (Q-Basair-65), the player and the app's
downloads (Q-Basair-66), and the player's direct fallback to the public sources (Q-Basair-95). Only
a surah no source has as one recording plays verse by verse from everyayah.com. Preparing on the
server: `docs/deployment.md` → *Preparing the recitations*.

## Why one recording per surah

Reciting verse files one after the other sounds joined: each verse is its own file, started when the
one before ends — a pause at every verse (longer on a slow connection), and in the background iOS
only lets the element already playing go on. A surah recorded in one piece sounds as the reciter
recited it, plays in the background like any track, and the lock screen shows its real length.
The player follows the verses with their **timings** (where each verse starts and ends in the
recording).

## Sources

`scripts/recitation_sources.json` lists the reciters and, for each, its sources in order of
preference; a surah is prepared from the first one that has it:

| Source | Audio | Timings |
|---|---|---|
| `qdc` — Quran.com | the chapter recording (`download.quranicaudio.com`) | verse and word timings (`api.qurancdn.com`) |
| `mp3quran` — mp3quran.net | the surah recording (`cdn.mp3quran.net`) | verse timings of its timed reads (`/api/v3/ayat_timing`), every riwāyah it publishes |
| `everyayah` — everyayah.com | the verse files, joined by us | each verse's exact length (decoded samples) |

With `discover_mp3quran`, every other timed mp3quran read is added (ids from its folder, e.g.
`ibrahim-akhdar`, `someone-r2`): 118 reciters in all today — Ḥafṣ, Warsh, Qālūn, al-Dūrī, al-Sūsī,
al-Bazzī, Shuʿbah. Only these hosts are ever fetched. Timings are checked before anything is
written: every verse once, in order, and ending with the recording (a source whose timings run
past its file is skipped for the next one).

## Preparation

```bash
python scripts/build_recitations.py --reciters configured        # those listed in the sources file
python scripts/build_recitations.py --reciters alafasy --surahs 1,112-114
python scripts/build_recitations.py --list                       # every reciter it knows
```

Each surah is encoded once, the same way for every reciter: MP3, constant bitrate (64 kbps mono by
default — `audio` in the sources file), no tags or cover art. Constant bitrate lets every player
seek exactly. Done surahs are kept (a run only prepares what is missing; `--force` redoes them), so
a stopped run resumes. Needs `ffmpeg` (in the API image).

Output — `data/recitations/` (`QBASAIR_RECITATIONS_PATH`), a runtime artifact, never committed:

```text
<reciter>/<SSS>.mp3     the surah
<reciter>/<SSS>.json    {duration_ms, bytes, version, source, attribution, verses: [[ayah, start_ms, end_ms]], words?}
catalog.json            the reciters, names, riwāyah, style, prepared surahs, sizes, sources
```

Sizes at 64 kbps mono: about 0.5–0.6 GB for a whole recitation; ~8 GB for the configured reciters,
~70 GB for all of them.

**Production**: a deploy whose commit carries `[prepare-recitations]` runs the script in the
background (detached, resumable) for `QBASAIR_PREPARE_RECITERS` in `.env.production`:
`configured` (default), `all`, or a list of ids.

## Serving

- `GET /api/reciters` — every reciter: the built-in ones (verse by verse from `audio_base`, plus
  their prepared `surahs`), then those heard only from prepared surahs (`audio_base` empty).
  `attribution` names the sources.
- `GET /api/recitations/{reciter}/{surah}` → `SurahRecitation` `{audio_url, duration_ms, bytes,
  attribution, verses: [{ayah, start_ms, end_ms}]}`; 404 when the surah isn't prepared (the player
  then recites it verse by verse). Cached a day.
- `GET /api/recitations/audio/{reciter}/{SSS}.mp3?v={version}` — the recording. **nginx serves it
  as a static file** (byte ranges, `immutable` for a year: the version changes with the file,
  `Cross-Origin-Resource-Policy: cross-origin` and `Access-Control-Allow-Origin: *` for the
  standalone app); the API's own route does the same where there is no nginx (development).

Serving prepared files costs the server bandwidth and disk only — no work per request; a CDN in
front (the platform's Cloudflare) keeps them at the edge.

## Credits

The recordings and their timings are the work of Quran.com (quranicaudio.com), mp3quran.net and
everyayah.com; each prepared surah keeps its `attribution`, and the reciter list shows it.

## The player

`features/recitation/recitation-context.tsx` (with `track.ts`): for a reciter's prepared surah
(`ReciterItem.surahs`) it fetches the timings once (`GET /api/recitations/{id}/{surah}`, kept for
the session) and recites from the one recording:

- a verse starts at its timing (the first verse at 0, with the surah's opening and basmala);
  previous / next verse and the progress bar seek **within the same file** — nothing is loaded;
- the verse being recited follows the recording's time (`boundaryAction`), even when an update
  skips a verse; a repeated verse loops, and a chosen range stops or loops, **exactly at the
  verse's end** (a timer for the last fraction of a second — time updates are coarse);
- the surah's progress and the lock screen show the recording's real length and position;
- at the end of the recording the next surah follows (its timings were fetched ahead);
- on a first tap, while the timings arrive, the element plays a moment of silence so the browser
  keeps the tap's permission to play;
- a surah not prepared by our server is taken **straight from its public source**
  (`features/recitation/direct-source.ts`): the same sources, in the same order, that the
  preparation uses — Quran.com's chapter recording and verse timings, then mp3quran.net's timed
  read (both answer any origin) — for the reciters `scripts/recitation_sources.json` lists with
  them (`direct-source.test.ts` keeps the two lists equal). The timings must cover every verse
  of the surah in order, and the audio must come from those hosts, or the source isn't used. The
  site's Content-Security-Policy (`deploy/nginx/*.conf.template`) allows them: `connect-src`
  `api.qurancdn.com` and `www.mp3quran.net`, `media-src` `download.quranicaudio.com` and
  `*.mp3quran.net`;
- only a surah no source has (an everyayah-only reciter, or no network) plays verse by verse, and
  it isn't asked again for ten minutes.

**App**: the reciter list comes from the server first (`/api/reciters` is answered by the server
when online and kept on the device for offline use — `fetch-router.ts`). A prepared surah
downloads as one file (`audio/<reciter>/<SSS>.mp3`) with its timings (kept in the device's
key-value store) and then plays from the device. A surah the server hasn't prepared downloads the
same way from its public source when it has one; only the others download verse by verse.

## Choosing a reciter

Both pickers (the desktop media bar's dropdown and the phone's sheet) list the reciters from
`/api/reciters` through `features/recitation/reciter-catalogue.ts`: only reciters with something
to play; the reader's narration first, then the built-in reciters in their order, then the others
by name; a search that ignores diacritics, alif forms, ة/ه and ى/ي (or matches the Latin name); and
narration chips («الكل», حفص, ورش, قالون…) when there are several. Each row says the narration,
the style when not murattal (مجوّد, معلّم) and how many surahs a reciter has when not all 114.
The app's downloads list the same reciters (prepared-only ones download their prepared surahs).
