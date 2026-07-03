"use client";

import { useEffect, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { AuthUserInfo, DeviceInfo } from "@q-basair/shared";

import { AVATAR_MOTIFS, type AvatarMotif, UserAvatar } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
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
 * AccountSettings — the Account + Devices cards of the settings screen.
 * Account: medallion + email + change-medallion. Devices: the active-sessions
 * registry with a "this device" badge and per-device eject. Auth-gated.
 */
export function AccountSettings() {
  const formatNumber = useNumerals();
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let cancelled = false;
    void api
      .getAuthSession({ suppressAuthRedirect: true })
      .then((session) => {
        if (!cancelled && session.authenticated) setUser(session.user ?? null);
      })
      .catch(() => {});
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

  if (!AUTH_ENABLED || !user) return null;

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

  async function eject(sessionId: number) {
    setDevices((list) => list.filter((device) => device.id !== sessionId));
    try {
      await api.ejectDevice(sessionId, { suppressAuthRedirect: true });
    } catch {
      /* ignore */
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
      </section>

      <section className="qb-setting-card">
        <h3>الأجهزة النشطة{devices.length ? ` · ${formatNumber(devices.length)}` : ""}</h3>
        <p className="card-sub">الجلسات المتصلة بحسابك — يمكنك إخراج أيّ جهاز.</p>
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
