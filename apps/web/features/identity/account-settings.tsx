"use client";

import { useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { AuthUserInfo, DeviceInfo } from "@q-basair/shared";

import { AVATAR_MOTIFS, type AvatarMotif, UserAvatar } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { clearGuestChoice } from "@/features/auth/identity-flow";
import { useNumerals } from "@/lib/preferences-context";

import "./account-settings.css";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const MOTIFS = Object.keys(AVATAR_MOTIFS) as AvatarMotif[];

function toMotif(value?: string | null): AvatarMotif {
  return value && (MOTIFS as string[]).includes(value) ? (value as AvatarMotif) : "ba";
}

function deviceIcon(platform?: string | null) {
  return platform === "ios" || platform === "android" ? "smartphone" : "monitor";
}

function relativeTime(epochSeconds: number, formatNumber: (n: number) => string): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds);
  if (diff < 90) return "نشط الآن";
  if (diff < 3600) return `قبل ${formatNumber(Math.floor(diff / 60))} دقيقة`;
  if (diff < 86400) return `قبل ${formatNumber(Math.floor(diff / 3600))} ساعة`;
  return `قبل ${formatNumber(Math.floor(diff / 86400))} يوم`;
}

/**
 * AccountSettings — the account & session home inside the Settings screen. It's
 * the canonical place to manage the session:
 *  • Guest → sign-in / create-account card (guest data merges on sign-up).
 *  • Signed in → account card (medallion + name + email + change medallion),
 *    the active-devices registry (this-device badge + per-device eject), and
 *    sign out.
 * Only present when auth is enabled (NEXT_PUBLIC_AUTH_ENABLED=1); with auth off
 * there is no account concept, so it renders nothing.
 */
export function AccountSettings() {
  const formatNumber = useNumerals();
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [picking, setPicking] = useState(false);
  const [ready, setReady] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Keep the name field seeded from the loaded profile (and after a save).
  useEffect(() => {
    if (user) setNameDraft(user.name || "");
  }, [user?.name]);

  useEffect(() => {
    if (!AUTH_ENABLED) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void api
      .getAuthSession({ suppressAuthRedirect: true })
      .then((session) => {
        if (!cancelled && session.authenticated) setUser(session.user ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    void api
      .getDevices({ suppressAuthRedirect: true })
      .then((list) => {
        if (!cancelled) setDevices(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!AUTH_ENABLED) return null;

  // Hold the card's place until the session check resolves, so an authenticated
  // user never sees the guest card flash first.
  if (!ready) {
    return (
      <section className="qb-setting-card" aria-busy="true">
        <h3>الحساب</h3>
        <p className="card-sub">جارٍ التحقّق من الجلسة…</p>
      </section>
    );
  }

  if (!user) {
    const next =
      typeof window !== "undefined"
        ? encodeURIComponent(`${window.location.pathname}${window.location.search}`)
        : "";
    return (
      <section className="qb-setting-card">
        <h3>الحساب</h3>
        <p className="card-sub">أنت الآن في وضع الضيف. سجّل الدخول لحفظ محفوظاتك ومزامنتها عبر أجهزتك.</p>
        <div className="qb-account-guest">
          <a className="qb-account-cta primary" href={`/login?next=${next}`}>
            <Icon name="user" size={15} />
            تسجيل الدخول
          </a>
          <a className="qb-account-cta" href={`/login?tab=signup&next=${next}`}>
            أنشئ حساباً
          </a>
        </div>
        <p className="card-sub">
          محفوظات الضيف (المثبَّتات والجلسات وموضع القراءة) تُدمَج في حسابك تلقائياً عند التسجيل.
        </p>
      </section>
    );
  }

  const motif = toMotif(user.avatar);

  async function chooseMotif(next: AvatarMotif) {
    setPicking(false);
    setUser((current) => (current ? { ...current, avatar: next } : current));
    try {
      await api.updateProfile({ avatar: next }, { suppressAuthRedirect: true });
    } catch {
      /* optimistic — a failed save just reverts on next load */
    }
  }

  async function saveName() {
    const next = nameDraft.trim();
    if (!user || !next || next === (user.name || "")) return;
    setUser((current) => (current ? { ...current, name: next } : current));
    try {
      await api.updateProfile({ name: next }, { suppressAuthRedirect: true });
    } catch {
      /* optimistic — a failed save just reverts on next load */
    }
  }

  async function eject(sessionId: number) {
    // Optimistic removal, but never leave a false success: if the server does
    // not actually revoke the session, restore the row and surface the failure.
    setDeviceError(null);
    const previous = devices;
    setDevices((list) => list.filter((device) => device.id !== sessionId));
    try {
      const result = await api.ejectDevice(sessionId, { suppressAuthRedirect: true });
      if (!result.deleted) {
        setDevices(previous);
        setDeviceError("تعذّر إخراج الجهاز. حاول مرة أخرى.");
      }
    } catch {
      setDevices(previous);
      setDeviceError("تعذّر إخراج الجهاز. تحقّق من اتصالك وأعد المحاولة.");
    }
  }

  async function signOut() {
    try {
      await api.logout({ suppressAuthRedirect: true });
    } catch {
      /* ignore */
    }
    clearGuestChoice();
    window.location.assign("/");
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await api.deleteAccount({ suppressAuthRedirect: true });
      clearGuestChoice();
      window.location.assign("/");
    } catch {
      setDeleting(false);
      setDeviceError("تعذّر حذف الحساب. حاول مرة أخرى.");
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <section className="qb-setting-card">
        <h3>الحساب</h3>
        <p className="card-sub">مداليتك واسمك المعروض.</p>
        <div className="qb-account-card">
          <UserAvatar motif={motif} size={56} />
          <div className="who">
            <div className="name">{user.name || "مستخدم"}</div>
            <div className="email">{user.email}</div>
          </div>
          <button type="button" className="qb-account-change" onClick={() => setPicking((v) => !v)}>
            غيّر المدالية
          </button>
        </div>
        {picking ? (
          <div className="qb-account-motifs">
            {MOTIFS.map((key) => (
              <button
                key={key}
                type="button"
                className={`tile${key === motif ? " selected" : ""}`}
                onClick={() => chooseMotif(key)}
                aria-label={AVATAR_MOTIFS[key].label}
                title={AVATAR_MOTIFS[key].label}
              >
                <UserAvatar motif={key} size={34} ring={false} />
              </button>
            ))}
          </div>
        ) : null}

        <div className="qb-account-field">
          <label htmlFor="qb-account-name">الاسم المعروض</label>
          <div className="qb-account-name-edit">
            <input
              id="qb-account-name"
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveName();
              }}
              placeholder="اسمك المعروض"
              maxLength={40}
            />
            <button
              type="button"
              className="save"
              onClick={() => void saveName()}
              disabled={!nameDraft.trim() || nameDraft.trim() === (user.name || "")}
            >
              حفظ
            </button>
          </div>
        </div>

        <button type="button" className="qb-account-signout-row" onClick={signOut}>
          <Icon name="logout" size={15} />
          تسجيل الخروج
        </button>

        {!confirmDelete ? (
          <button
            type="button"
            className="qb-account-delete-row"
            onClick={() => {
              setDeviceError(null);
              setConfirmDelete(true);
            }}
          >
            حذف الحساب نهائياً
          </button>
        ) : (
          <div className="qb-account-delete-confirm" role="alertdialog" aria-label="تأكيد حذف الحساب">
            <p>
              سيُحذف حسابك وكل محفوظاتك (المثبَّتات والجلسات والجذور والإعدادات) نهائياً على كل الأجهزة.
              لا يمكن التراجع.
            </p>
            <div className="qb-account-delete-actions">
              <button type="button" className="danger" onClick={deleteAccount} disabled={deleting}>
                {deleting ? "جارٍ الحذف…" : "احذف نهائياً"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                إلغاء
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="qb-setting-card">
        <h3>الأجهزة النشطة{devices.length ? ` · ${formatNumber(devices.length)}` : ""}</h3>
        <p className="card-sub">الجلسات المتصلة بحسابك — يمكنك إخراج أيّ جهاز.</p>
        {deviceError ? (
          <div className="qb-devices-error" role="alert">
            {deviceError}
          </div>
        ) : null}
        <div className="qb-devices">
          {devices.map((device) => (
            <div key={device.id} className="qb-device-row">
              <Icon name={deviceIcon(device.platform)} size={16} />
              <div className="info">
                <div className="label">
                  {device.device_label || "جهاز"}
                  {device.is_current ? <span className="this">هذا الجهاز</span> : null}
                </div>
                <div className="meta">{relativeTime(device.last_seen_at, formatNumber)}</div>
              </div>
              {!device.is_current ? (
                <button type="button" className="qb-device-eject" onClick={() => eject(device.id)}>
                  أخرِج
                </button>
              ) : null}
            </div>
          ))}
          {devices.length === 0 ? <div className="qb-devices-empty">لا أجهزة أخرى.</div> : null}
        </div>
      </section>
    </>
  );
}
