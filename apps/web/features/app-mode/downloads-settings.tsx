"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { SurahListItem } from "@q-basair/shared";

import { SelectMenu } from "@/components/select-menu";
import { downloadSurahAudio, downloadedAudio, removeReciterAudio, type AudioRegistry } from "@/lib/app-mode/audio";
import { startReciterDownload, stopReciterDownload, useAudioJob } from "@/lib/app-mode/audio-jobs";
import { APP_MODE } from "@/lib/app-mode/config";
import type { InstalledPack, Manifest, PackEntry } from "@/lib/app-mode/packs";
import { appRuntime } from "@/lib/app-mode/runtime";
import { useNumerals } from "@/lib/preferences-context";
import { activeLocale, t } from "@/lib/i18n";

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

      {reciters.length ? <Recitations reciters={reciters} audio={audio} busy={busy} act={act} onChanged={refresh} /> : null}
    </section>
  );
}

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
  // The whole recitation's download runs outside this screen (audio-jobs.ts).
  const job = useAudioJob();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);
  const [reciterId, setReciterId] = useState(reciters[0]?.reciter ?? "");
  const [surah, setSurah] = useState(1);

  useEffect(() => {
    void fetch("/api/surahs?mushaf=2")
      .then((response) => response.json() as Promise<SurahListItem[]>)
      .then(setSurahs)
      .catch(() => setSurahs([]));
  }, []);

  const reciter = reciters.find((pack) => pack.reciter === reciterId);
  const saved = useMemo(() => Object.keys(audio[reciterId] ?? {}).length, [audio, reciterId]);
  const bytes = useMemo(() => Object.values(audio[reciterId] ?? {}).reduce((total, value) => total + value, 0), [audio, reciterId]);
  const target = surahs.find((item) => item.id === surah);
  const id = `audio-${reciterId}-${surah}`;
  const running = job?.status === "running";
  const mine = job && job.reciterId === reciterId ? job : null;
  const complete = surahs.length > 0 && saved >= surahs.length;
  const percent = mine && mine.total ? Math.round((mine.done / mine.total) * 100) : 0;

  // A finished, stopped or failed job: the list of saved surahs is read again.
  useEffect(() => {
    if (job && job.status !== "running") void onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);
  useEffect(() => setConfirmRemove(false), [reciterId]);

  const downloadAll = () => {
    if (!reciter?.audio_base || !surahs.length) return;
    void startReciterDownload({ id: reciterId, audio_base: reciter.audio_base }, surahs);
  };

  return (
    <div className="qb-downloads-group">
      <h4>{t("التلاوات")}</h4>
      <div className="qb-setting-row">
        <SelectMenu
          className="qb-setting-menu"
          ariaLabel={t("التلاوات")}
          value={reciterId}
          options={reciters.map((pack) => ({ value: pack.reciter ?? pack.id, label: pack.name ?? pack.id }))}
          onChange={setReciterId}
        />
      </div>
      {/* The whole recitation, for listening anywhere without a connection. */}
      <div className="qb-download-row">
        <div className="name">
          <div>{t("التلاوة كاملة")}</div>
          <Meta
            parts={[
              t("{0} من {1} سورة", { 0: formatNumber(saved), 1: formatNumber(surahs.length || 114) }),
              formatSize(bytes),
              mine?.status === "running" && mine.surah ? t("سورة {0}", { 0: formatNumber(mine.surah) }) : null,
            ]}
          />
          {mine?.status === "failed" ? (
            <div className="meta" role="alert">
              {t("تعذّر التنزيل. تحقّق من الاتصال ثم أعد المحاولة.")}
            </div>
          ) : !complete && !running ? (
            <div className="meta">{t("قد تبلغ التلاوة كاملة نحو غيغابايت حسب القارئ؛ يُفضَّل الاتصال بشبكة Wi‑Fi.")}</div>
          ) : null}
        </div>
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
            {!complete ? (
              <button type="button" className="qb-btn ghost sm" disabled={running || Boolean(busy) || !reciter?.audio_base || !surahs.length} onClick={downloadAll}>
                {saved ? t("استئناف") : t("تنزيل الكل")}
              </button>
            ) : null}
            {saved ? (
              <button
                type="button"
                className="qb-btn ghost sm"
                disabled={running || Boolean(busy)}
                onClick={() => {
                  // A whole recitation is large to fetch again: a second tap confirms.
                  if (!confirmRemove) {
                    setConfirmRemove(true);
                    return;
                  }
                  setConfirmRemove(false);
                  void act(`audio-${reciterId}-all`, () => removeReciterAudio(reciterId));
                }}
              >
                {confirmRemove ? t("تأكيد الحذف") : t("حذف الكل")}
              </button>
            ) : null}
          </>
        )}
      </div>

      <div className="qb-download-row">
        <div className="name">
          <SelectMenu
            className="qb-setting-menu"
            ariaLabel={t("السورة")}
            value={String(surah)}
            options={surahs.map((item) => ({ value: String(item.id), label: `${formatNumber(item.id)}. ${item.name}` }))}
            onChange={(value) => setSurah(Number(value))}
          />
          <Meta parts={[t("سورة واحدة")]} />
        </div>
        {busy?.id === id ? (
          <div className="bar-wrap" role="status" aria-label={`${busy.percent}%`}>
            <div className="qb-download-bar">
              <span style={{ width: `${busy.percent}%` }} />
            </div>
          </div>
        ) : audio[reciterId]?.[surah] ? (
          <button type="button" className="qb-btn ghost sm" disabled={Boolean(busy) || running} onClick={() => void act(id, () => removeReciterAudio(reciterId, surah))}>
            {t("حذف")}
          </button>
        ) : (
          <button
            type="button"
            className="qb-btn ghost sm"
            disabled={Boolean(busy) || running || !reciter?.audio_base || !target}
            onClick={() =>
              void act(id, (onPercent) =>
                downloadSurahAudio({ id: reciterId, audio_base: reciter!.audio_base! }, surah, target!.ayah_count, (done, total) =>
                  onPercent(Math.round((done / total) * 100)),
                ),
              )
            }
          >
            {t("تنزيل")}
          </button>
        )}
      </div>
    </div>
  );
}
