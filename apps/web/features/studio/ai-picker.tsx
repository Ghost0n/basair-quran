"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { AiProviderItem, ThinkingLevel } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { SelectMenu } from "@/components/select-menu";
import { identityApi } from "@/features/auth/identity-flow";
import { aiConnection, aiHeaders, setProviderModel, setProviderThinking, subscribeAiConnection } from "@/lib/ai-connection";
import { t } from "@/lib/i18n";

const DEFAULT_THINKING = "auto";

const THINKING_LABELS: Record<ThinkingLevel | typeof DEFAULT_THINKING, () => string> = {
  auto: () => t("تفكير تلقائي"),
  off: () => t("بلا تفكير"),
  low: () => t("تفكير قليل"),
  medium: () => t("تفكير متوسّط"),
  high: () => t("تفكير عميق"),
};

// Fetched once per page: the providers, and each provider+key's models.
let providersOnce: Promise<AiProviderItem[]> | null = null;
const modelsByKey = new Map<string, Promise<string[]>>();

export function loadAiProviders(): Promise<AiProviderItem[]> {
  providersOnce ??= identityApi.getAiProviders().catch(() => {
    providersOnce = null;
    return [];
  });
  return providersOnce;
}

function loadModels(cacheKey: string): Promise<string[]> {
  let found = modelsByKey.get(cacheKey);
  if (!found) {
    found = identityApi
      .getResearchAgentSettings({ headers: aiHeaders(aiConnection()), suppressAuthRedirect: true })
      .then((answer) => answer.available_models.map((item) => item.name))
      .catch(() => {
        modelsByKey.delete(cacheKey);
        return [];
      });
    modelsByKey.set(cacheKey, found);
  }
  return found;
}

/** The connected provider's spec (null: Basair's own model, or still loading). */
export function useAiProvider() {
  const connection = useSyncExternalStore(subscribeAiConnection, aiConnection, aiConnection);
  const [providers, setProviders] = useState<AiProviderItem[]>([]);
  useEffect(() => {
    let live = true;
    void loadAiProviders().then((items) => live && setProviders(items));
    return () => {
      live = false;
    };
  }, []);
  const spec = providers.find((item) => item.id === connection.provider) ?? null;
  return { connection, spec };
}

/**
 * The chat's AI controls, beside the send button: the connected provider's
 * model (from the list the provider gives for the reader's key) and, when that
 * provider can be asked to think longer or shorter, how much (`X-QBasair-LLM-
 * Thinking`, docs/ai-connections.md). Both are saved with the connection, per
 * provider, on this device. With Basair's own model there is nothing to pick:
 * its name opens the AI settings.
 */
export function AiPicker({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { connection, spec } = useAiProvider();
  const provider = connection.provider;
  const key = provider ? connection.keys[provider] : undefined;
  const model = provider ? connection.models[provider] : undefined;
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    setModels([]);
    if (!provider || !key) return;
    let live = true;
    void loadModels(`${provider}:${key}`).then((names) => live && setModels(names));
    return () => {
      live = false;
    };
  }, [provider, key]);

  if (!provider) {
    return (
      <button type="button" className="qb-ai-chip" onClick={onOpenSettings} title={t("الذكاء الاصطناعي")}>
        <Icon name="sparkles" size={13} />
        <span>{t("نموذج بصائر")}</span>
      </button>
    );
  }
  if (!spec || !key) return null;

  const modelOptions = (models.length ? models : model ? [model] : []).map((name) => ({ value: name, label: name }));
  const levels = spec.thinking;
  const thinking = connection.thinking[provider];

  return (
    <div className="qb-ai-picker">
      {modelOptions.length ? (
        <SelectMenu
          className="qb-ai-select is-model"
          ariaLabel={`${t("النموذج")} · ${spec.name}`}
          value={model ?? modelOptions[0].value}
          options={modelOptions}
          onChange={(name) => setProviderModel(provider, name)}
        />
      ) : null}
      {levels.length ? (
        <SelectMenu
          className="qb-ai-select is-thinking"
          ariaLabel={t("مدى التفكير")}
          value={thinking && levels.includes(thinking) ? thinking : DEFAULT_THINKING}
          options={[DEFAULT_THINKING, ...levels].map((level) => ({
            value: level,
            label: THINKING_LABELS[level as ThinkingLevel | typeof DEFAULT_THINKING](),
          }))}
          onChange={(level) => setProviderThinking(provider, level === DEFAULT_THINKING ? null : (level as ThinkingLevel))}
        />
      ) : null}
    </div>
  );
}
