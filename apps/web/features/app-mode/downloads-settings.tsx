"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ReciterItem, SurahListItem } from "@q-basair/shared";

import { SelectMenu } from "@/components/select-menu";
import { downloadedAudio, partialAudio, removeReciterAudio, type AudioRegistry, type PartialAudio } from "@/lib/app-mode/audio";
import { startReciterDownload, stopReciterDownload, useAudioJob } from "@/lib/app-mode/audio-jobs";
import { APP_MODE } from "@/lib/app-mode/config";
import type { InstalledPack, Manifest, PackEntry } from "@/lib/app-mode/packs";
import { appRuntime } from "@/lib/app-mode/runtime";
import { useNumerals } from "@/lib/preferences-context";
import { activeLocale, t } from "@/lib/i18n";

import { reciterName } from "@/features/recitation/reciter-catalogue";
import { languageLabel } from "@/features/settings/translations-settings";

import "./app-mode.css";

function formatSize(bytes: number | undefined): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unit]}`;
}

type Busy = { id: string; percent: number } | null;

/** «a · b · c» with each part isolated, so Arabic names and Latin sizes don't reorder each other. */
function Meta({ parts }: { parts: (string | null | undefined)[] }) {
  const shown = parts.filter((part): part is string => Boolean(part));
  return (
    <div className="meta">
      {shown.map((part, index) => (
        <span key={index}>
          {index ? " · " : null}
          <bdi>{part}</bdi>
        </span>
      ))}
    </div>
  );
}

/**
 * «التنزيلات» — the standalone app's downloads: other narrations,
 * translations of meanings and recitations, for use without a connection.
 * Nothing here exists on the web (it renders nothing there).
 */
export function DownloadsSettings() {
  if (!APP_MODE) return null;
  return <Downloads />;
}

function Downloads() {
  const [manifest, setManifest] = useState<Manifest | null | undefined>(undefined);
  const [installed, setInstalled] = useState<Record<string, InstalledPack>>({});
  const [audio, setAudio] = useState<AudioRegistry>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { packs } = await appRuntime();
    const [catalogue, current, recitations] = await Promise.all([packs.catalogue(), packs.installed(), downloadedAudio()]);
    setManifest(catalogue);
    setInstalled(current);
    setAudio(recitations);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setManifest(null));
  }, [refresh]);

  const act = async (id: string, action: (onPercent: (percent: number) => void) => Promise<void>) => {
    setBusy({ id, percent: 0 });
    setFailed(null);
    try {
      await action((percent) => setBusy({ id, percent }));
    } catch {
      setFailed(id);
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const install = (pack: PackEntry) =>
    act(pack.id, async (onPercent) => {
      const { packs } = await appRuntime();
      await packs.install(pack, ({ received, total }) => onPercent(total ? Math.round((received / total) * 100) : 0));
    });

  const remove = (id: string) =>
    act(id, async () => {
      const { packs } = await appRuntime();
      await packs.remove(id);
    });

  if (manifest === undefined) return null;

  const narrations = manifest?.packs.filter((pack) => pack.kind === "narration") ?? [];
  const translations = (manifest?.packs.filter((pack) => pack.kind === "translation") ?? []).sort(
    (a, b) => (a.language ?? "").localeCompare(b.language ?? "") || (a.name ?? "").localeCompare(b.name ?? ""),
  );
  const reciters = manifest?.packs.filter((pack) => pack.kind === "reciter") ?? [];

  const row = (pack: PackEntry, label: string, detail?: string) => {
    const mine = installed[pack.id];
    const outdated = mine && pack.version && mine.version !== pack.version;
    return (
      <div className="qb-download-row" key={pack.id}>
        <div className="name">
          <div>{label}</div>
          <Meta parts={[detail, formatSize(pack.size), mine ? t("مثبّت") : null]} />
          {failed === pack.id ? (
            <div className="meta" role="alert">
              {t("تعذّر التنزيل. تحقّق من الاتصال ثم أعد المحاولة.")}
            </div>
          ) : null}
        </div>
        {busy?.id === pack.id ? (
          <div className="bar-wrap" role="status" aria-label={`${busy.percent}%`}>
            <div className="qb-download-bar">
              <span style={{ width: `${busy.percent}%` }} />
            </div>
          </div>
        ) : (
          <>
            {outdated ? (
              <button type="button" className="qb-btn ghost sm" disabled={Boolean(busy)} onClick={() => void install(pack)}>
                {t("تحديث")}
              </button>
            ) : null}
            {mine ? (
              <button type="button" className="qb-btn ghost sm" disabled={Boolean(busy)} onClick={() => void remove(pack.id)}>
                {t("حذف")}
              </button>
            ) : (
              <button type="button" className="qb-btn ghost sm" disabled={Boolean(busy) || !manifest} onClick={() => void install(pack)}>
                {t("تنزيل")}
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <section className="qb-setting-card">
      <h3>{t("التنزيلات")}</h3>
      <p className="card-sub">{t("المصاحف والترجمات واللغات والتلاوات للاستعمال دون اتصال.")}</p>
      {!manifest ? <p className="card-sub">{t("الفهرس غير متاح دون اتصال.")}</p> : null}

      {narrations.length ? (
        <div className="qb-downloads-group">
          <h4>{t("الروايات")}</h4>
          {narrations.map((pack) => row(pack, pack.name ?? pack.id, pack.description))}
        </div>
      ) : null}

      {translations.length ? (
        <div className="qb-downloads-group">
          <h4>{t("ترجمة المعاني")}</h4>
          {translations.map((pack) => row(pack, `${languageLabel(pack.language ?? "", activeLocale())} — ${pack.name ?? ""}`, pack.translator))}
        </div>
      ) : null}

      {manifest ? <Recitations reciters={reciters} audio={audio} busy={busy} act={act} onChanged={refresh} /> : null}
    </section>
  );
}

type ReciterEntry = { id: string; name: string; audio_base: string; surahs: number[] };

/**
 * «التلاوات»: one step to download a recitation (the reciter, then
 * «تنزيل»), and below it everything on the device, a row per reciter: how
 * much, resume, delete — and, opened, each of its surahs to delete one by
 * one or another surah to add.
 */
function Recitations({
  reciters,
  audio,
  busy,
  act,
  onChanged,
}: {
  reciters: PackEntry[];
  audio: AudioRegistry;
  busy: Busy;
  act: (id: string, action: (onPercent: (percent: number) => void) => Promise<void>) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const formatNumber = useNumerals();
  // The download runs outside this screen (audio-jobs.ts).
  const job = useAudioJob();
  const running = job?.status === "running";
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/surahs?mushaf=2")
      .then((response) => response.json() as Promise<SurahListItem[]>)
      .then(setSurahs)
      .catch(() => setSurahs([]));
  }, []);

  // The server's reciters: each one's surahs prepared as one recording
  // (downloaded as one file), and the reciters heard only from those
  // (docs/recitation-audio.md), listed after the offline pack's own.
  const [catalogue, setCatalogue] = useState<ReciterItem[]>([]);
  useEffect(() => {
    void fetch("/api/reciters")
      .then((response) => response.json() as Promise<ReciterItem[]>)
      .then(setCatalogue)
      .catch(() => setCatalogue([]));
  }, []);
  const entries = useMemo<ReciterEntry[]>(() => {
    const own = reciters.map((pack) => ({
      id: pack.reciter ?? pack.id,
      name: reciterName({ name: pack.name ?? pack.id, name_english: pack.name_english ?? "" }),
      audio_base: pack.audio_base ?? "",
    }));
    const known = new Set(own.map((entry) => entry.id));
    const more = catalogue
      .filter((item) => !known.has(item.id) && item.surahs?.length)
      .map((item) => ({ id: item.id, name: reciterName(item), audio_base: "" }));
    return [...own, ...more].map((entry) => ({ ...entry, surahs: catalogue.find((item) => item.id === entry.id)?.surahs ?? [] }));
  }, [reciters, catalogue]);

  // Verses downloaded with a range (the recitation sheet) count too.
  const [partial, setPartial] = useState<PartialAudio>({});
  useEffect(() => {
    void partialAudio().then(setPartial);
  }, [audio, job?.status]);

  // A finished, stopped or failed job: what is on the device is read again.
  useEffect(() => {
    if (job && job.status !== "running") void onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  // What a reciter can be downloaded for: every surah with verse files, else its prepared ones.
  const availableFor = (entry: ReciterEntry | undefined) =>
    !entry ? [] : entry.audio_base ? surahs : surahs.filter((item) => entry.surahs.includes(item.id));
  const savedCount = (id: string) => Object.keys(audio[id] ?? {}).length;
  const partialSurahs = (id: string) => Object.keys(partial[id] ?? {}).filter((key) => partial[id][key].ayahs.length && !audio[id]?.[key]);
  const sizeOf = (id: string) =>
    Object.values(audio[id] ?? {}).reduce((total, value) => total + value, 0) +
    Object.values(partial[id] ?? {}).reduce((total, entry) => total + entry.bytes, 0);
  const isComplete = (entry: ReciterEntry) => {
    const available = availableFor(entry);
    return available.length > 0 && available.every((item) => audio[entry.id]?.[item.id]);
  };

  // On the device: anything saved, or a download under way.
  const onDevice = entries.filter((entry) => savedCount(entry.id) || partialSurahs(entry.id).length || job?.reciterId === entry.id);
  // To download: the reciters not yet whole on the device.
  const offered = entries.filter((entry) => !isComplete(entry) && (entry.audio_base || entry.surahs.length));
  const [pick, setPick] = useState("");
  const picked = offered.find((entry) => entry.id === pick) ?? offered[0];

  const toDownloadable = (entry: ReciterEntry) => ({ id: entry.id, audio_base: entry.audio_base, surahs: entry.surahs });
  const downloadAll = (entry: ReciterEntry) => {
    const available = availableFor(entry);
    if (!available.length) return;
    setOpened(null);
    void startReciterDownload(toDownloadable(entry), available);
  };
  const downloadOne = (entry: ReciterEntry, surah: number) => {
    const item = surahs.find((candidate) => candidate.id === surah);
    if (item) void startReciterDownload(toDownloadable(entry), [item]);
  };
  const surahName = (id: number) => surahs.find((item) => item.id === id)?.name ?? formatNumber(id);

  if (!entries.length) return null;

  return (
    <div className="qb-downloads-group">
      <h4>{t("التلاوات")}</h4>
      {/* One step: the reciter, then «تنزيل» (the whole recitation). */}
      {offered.length ? (
        <div className="qb-download-row qb-download-pick">
          <div className="name">
            <SelectMenu
              className="qb-setting-menu"
              ariaLabel={t("القارئ")}
              value={picked?.id ?? ""}
              options={offered.map((entry) => ({ value: entry.id, label: entry.name }))}
              onChange={setPick}
            />
            <div className="meta">{t("قد تبلغ التلاوة كاملة نحو غيغابايت حسب القارئ؛ يُفضَّل الاتصال بشبكة Wi‑Fi.")}</div>
          </div>
          <button
            type="button"
            className="qb-btn ghost sm"
            disabled={running || Boolean(busy) || !picked || !availableFor(picked).length}
            onClick={() => picked && downloadAll(picked)}
          >
            {t("تنزيل")}
          </button>
        </div>
      ) : null}

      {onDevice.length ? <h5 className="qb-downloads-sub">{t("على الجهاز")}</h5> : null}
      {onDevice.map((entry) => {
        const available = availableFor(entry);
        const saved = savedCount(entry.id);
        const mine = job?.reciterId === entry.id ? job : null;
        const complete = isComplete(entry);
        const percent = mine && mine.total ? Math.round((mine.done / mine.total) * 100) : 0;
        const open = opened === entry.id;
        const removeId = `audio-${entry.id}-all`;
        const savedSurahs = Object.keys(audio[entry.id] ?? {}).map(Number).sort((a, b) => a - b);
        const verseSurahs = partialSurahs(entry.id).map(Number).sort((a, b) => a - b);
        const missing = available.filter((item) => !audio[entry.id]?.[item.id]);
        return (
          <div className={`qb-download-reciter${open ? " open" : ""}`} key={entry.id}>
            <div className="qb-download-row">
              <button type="button" className="name qb-download-toggle" aria-expanded={open} onClick={() => setOpened(open ? null : entry.id)}>
                <div>{entry.name}</div>
                <Meta
                  parts={[
                    t("{0} من {1} سورة", { 0: formatNumber(saved), 1: formatNumber(available.length || 114) }),
                    formatSize(sizeOf(entry.id)),
                    mine?.status === "running" && mine.surah ? t("سورة {0}", { 0: formatNumber(mine.surah) }) : null,
                  ]}
                />
                {mine?.status === "failed" ? (
                  <div className="meta" role="alert">
                    {t("تعذّر التنزيل. تحقّق من الاتصال ثم أعد المحاولة.")}
                  </div>
                ) : null}
              </button>
              {mine?.status === "running" ? (
                <>
                  <div className="bar-wrap" role="status" aria-label={`${formatNumber(percent)}%`}>
                    <div className="qb-download-bar">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <button type="button" className="qb-btn ghost sm" onClick={stopReciterDownload}>
                    {t("إيقاف")}
                  </button>
                </>
              ) : (
                <>
                  {!complete && saved ? (
                    <button type="button" className="qb-btn ghost sm" disabled={running || Boolean(busy)} onClick={() => downloadAll(entry)}>
                      {t("استئناف")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="qb-btn ghost sm"
                    disabled={running || Boolean(busy)}
                    onClick={() => {
                      // A whole recitation is large to fetch again: a second tap confirms.
                      if (confirmRemove !== entry.id) {
                        setConfirmRemove(entry.id);
                        return;
                      }
                      setConfirmRemove(null);
                      setOpened(null);
                      void act(removeId, () => removeReciterAudio(entry.id));
                    }}
                  >
                    {confirmRemove === entry.id ? t("تأكيد الحذف") : t("حذف")}
                  </button>
                </>
              )}
            </div>
            {open ? (
              <div className="qb-download-surahs">
                {savedSurahs.map((surah) => (
                  <SurahRow
                    key={`s${surah}`}
                    label={`${formatNumber(surah)}. ${surahName(surah)}`}
                    detail={formatSize(audio[entry.id]?.[surah])}
                    busy={busy?.id === `audio-${entry.id}-${surah}`}
                    disabled={running || Boolean(busy)}
                    onRemove={() => void act(`audio-${entry.id}-${surah}`, () => removeReciterAudio(entry.id, surah))}
                  />
                ))}
                {verseSurahs.map((surah) => (
                  <SurahRow
                    key={`v${surah}`}
                    label={`${formatNumber(surah)}. ${surahName(surah)}`}
                    detail={t("{0} آية", { 0: formatNumber(partial[entry.id][surah].ayahs.length) })}
                    busy={busy?.id === `audio-${entry.id}-${surah}`}
                    disabled={running || Boolean(busy)}
                    onRemove={() => void act(`audio-${entry.id}-${surah}`, () => removeReciterAudio(entry.id, surah))}
                  />
                ))}
                {missing.length && !complete ? (
                  <AddSurah
                    options={missing.map((item) => ({ value: String(item.id), label: `${formatNumber(item.id)}. ${item.name}` }))}
                    disabled={running || Boolean(busy)}
                    onAdd={(surah) => downloadOne(entry, surah)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** One surah on the device, with its delete. */
function SurahRow({ label, detail, busy, disabled, onRemove }: { label: string; detail?: string; busy: boolean; disabled: boolean; onRemove: () => void }) {
  return (
    <div className="qb-download-row is-surah">
      <div className="name">
        <div>{label}</div>
        <Meta parts={[detail]} />
      </div>
      {busy ? (
        <div className="bar-wrap" role="status" aria-busy="true">
          <div className="qb-download-bar">
            <span style={{ width: "100%" }} />
          </div>
        </div>
      ) : (
        <button type="button" className="qb-btn ghost sm" disabled={disabled} onClick={onRemove}>
          {t("حذف")}
        </button>
      )}
    </div>
  );
}

/** Another surah of this reciter to the device. */
function AddSurah({ options, disabled, onAdd }: { options: { value: string; label: string }[]; disabled: boolean; onAdd: (surah: number) => void }) {
  const [surah, setSurah] = useState(options[0]?.value ?? "");
  const value = options.some((option) => option.value === surah) ? surah : options[0]?.value ?? "";
  return (
    <div className="qb-download-row is-surah">
      <div className="name">
        <SelectMenu className="qb-setting-menu" ariaLabel={t("السورة")} value={value} options={options} onChange={setSurah} />
      </div>
      <button type="button" className="qb-btn ghost sm" disabled={disabled || !value} onClick={() => onAdd(Number(value))}>
        {t("تنزيل")}
      </button>
    </div>
  );
}
