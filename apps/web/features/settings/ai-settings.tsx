"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { AiProviderId, AiProviderItem } from "@q-basair/shared";

import { SelectMenu } from "@/components/select-menu";
import { identityApi } from "@/features/auth/identity-flow";
import {
  aiConnection,
  aiHeaders,
  chooseProvider,
  maskKey,
  preferredModel,
  setProviderKey,
  setProviderModel,
  subscribeAiConnection,
} from "@/lib/ai-connection";
import { APP_MODE } from "@/lib/app-mode/config";
import { startOpenRouterSignIn } from "@/lib/openrouter-signin";
import { t } from "@/lib/i18n";

const SERVER = "server";

type Check = { state: "idle" | "testing" | "ok" | "failed"; models: string[] };

/**
 * «الذكاء الاصطناعي» (Settings; it left the study page): which AI the study
 * uses — Basair's own, or the reader's account with a major provider. A
 * provider takes a key (or, for OpenRouter, a sign-in) and a model chosen from
 * those it lists; its address is known, so none is ever asked. The key stays
 * on this device (lib/ai-connection.ts).
 */
export function AiSettings() {
  const connection = useSyncExternalStore(subscribeAiConnection, aiConnection, aiConnection);
  const [providers, setProviders] = useState<AiProviderItem[]>([]);
  const [draft, setDraft] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle", models: [] });
  const provider = connection.provider;
  const spec = providers.find((item) => item.id === provider) ?? null;
  const key = provider ? connection.keys[provider] : undefined;
  const model = provider ? connection.models[provider] : undefined;

  useEffect(() => {
    identityApi.getAiProviders().then(setProviders, () => setProviders([]));
  }, []);

  // A provider with a key: list its models (and so test the key).
  useEffect(() => {
    setDraft("");
    if (!provider || !key) {
      setCheck({ state: "idle", models: [] });
      return;
    }
    let cancelled = false;
    setCheck({ state: "testing", models: [] });
    identityApi.getResearchAgentSettings({ headers: aiHeaders(aiConnection()), suppressAuthRedirect: true }).then(
      (answer) => {
        if (cancelled) return;
        const names = answer.available_models.map((item) => item.name);
        setCheck({ state: "ok", models: names });
        if (!aiConnection().models[provider] && spec) {
          const chosen = preferredModel(spec.prefer, names);
          if (chosen) setProviderModel(provider, chosen);
        }
      },
      () => !cancelled && setCheck({ state: "failed", models: [] }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, key, spec?.id]);

  const options = [
    { value: SERVER, label: t("نموذج بصائر (الافتراضي)") },
    ...providers.map((item) => ({ value: item.id, label: item.name })),
  ];

  return (
    <section className="qb-setting-card qb-ai-settings">
      <h3>{t("الذكاء الاصطناعي")}</h3>
      <p className="card-sub">
        {t("تعمل الدراسة بنموذج بصائر، أو بحسابك لدى أحد المزوّدين: يكفي مفتاحك أو الدخول بحسابك، دون أي عنوان خادم.")}
      </p>

      <div className="qb-setting-row is-split">
        <div className="txt">
          <span className="name">{t("المزوّد")}</span>
          <span className="hint">{provider ? spec?.name : t("لا يحتاج إلى مفتاح.")}</span>
        </div>
        <div className="ctl">
          <SelectMenu
            className="qb-setting-menu"
            ariaLabel={t("المزوّد")}
            value={provider ?? SERVER}
            options={options}
            onChange={(value) => chooseProvider(value === SERVER ? null : (value as AiProviderId))}
          />
        </div>
      </div>

      {provider && spec ? (
        <>
          {spec.signin && !APP_MODE ? (
            <div className="qb-setting-row is-split">
              <div className="txt">
                <span className="name">{t("الدخول")}</span>
                <span className="hint">{t("سجّل الدخول بحسابك، فيُربط تلقائياً دون نسخ مفتاح.")}</span>
              </div>
              <div className="ctl">
                <button type="button" className="qb-btn ghost sm" onClick={() => void startOpenRouterSignIn()}>
                  {key ? t("إعادة الدخول") : t("الدخول بحساب {0}", { 0: spec.name })}
                </button>
              </div>
            </div>
          ) : null}

          <div className="qb-setting-row is-split">
            <div className="txt">
              <span className="name">{t("مفتاح الوصول")}</span>
              <span className="hint">
                <a href={spec.key_url} target="_blank" rel="noreferrer">
                  {t("احصل على مفتاح من {0}", { 0: spec.name })}
                </a>
                {" · "}
                {t("يبقى على هذا الجهاز.")}
              </span>
            </div>
            <div className="ctl">
              {key ? (
                <>
                  <span className="value" dir="ltr">
                    {maskKey(key)}
                  </span>
                  <button type="button" className="qb-btn ghost sm" onClick={() => setProviderKey(provider, null)}>
                    {t("نسيان المفتاح")}
                  </button>
                </>
              ) : (
                <form
                  className="qb-ai-key"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (draft.trim()) setProviderKey(provider, draft);
                  }}
                >
                  <input
                    type="password"
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t("ألصق المفتاح هنا")}
                    aria-label={t("مفتاح الوصول")}
                  />
                  <button type="submit" className="qb-btn ghost sm" disabled={!draft.trim()}>
                    {t("حفظ")}
                  </button>
                </form>
              )}
            </div>
          </div>

          {key ? (
            <div className="qb-setting-row is-split">
              <div className="txt">
                <span className="name">{t("النموذج")}</span>
                <span className="hint" role="status">
                  {check.state === "testing"
                    ? t("جارٍ الاتصال…")
                    : check.state === "failed"
                      ? t("تعذّر الاتصال بهذا المفتاح. تحقّق منه أو من رصيد حسابك.")
                      : check.state === "ok"
                        ? t("متّصل ✓")
                        : null}
                </span>
              </div>
              <div className="ctl">
                {check.models.length ? (
                  <SelectMenu
                    className="qb-setting-menu"
                    ariaLabel={t("النموذج")}
                    value={model ?? check.models[0]}
                    options={check.models.map((name) => ({ value: name, label: name }))}
                    onChange={(name) => setProviderModel(provider, name)}
                  />
                ) : (
                  <span className="value" dir="ltr">
                    {model ?? "—"}
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
