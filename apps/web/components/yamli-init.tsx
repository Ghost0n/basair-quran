"use client";

import { useEffect } from "react";

const YAMLI_UI_TEXTS = new Set([
  "اعرض المزيد",
  "كلمة ناقصة",
  "أغلق",
  "خيارات",
  "مساعدة",
  "تفعيل الخدمة",
  "تعطيل الخدمة",
  "من اليسار إلى اليمين",
  "من اليمين إلى اليسار",
  "نصائح سريعة",
  "Powered by Yamli.com",
]);

type YamliSuggestionLike = string | { trans?: string };

declare global {
  interface Window {
    Yamli?: {
      init?: (options: Record<string, unknown>) => boolean;
      yamlify?: (targetId: string, options: Record<string, unknown>) => void;
      global?: {
        setKeyboardEnabled?: (enabled: boolean) => void;
        registerTransliteration?: (...args: unknown[]) => unknown;
        _qbasairOriginalRegister?: (...args: unknown[]) => unknown;
        _qbasairWrapped?: boolean;
      };
    };
  }
}

function normalizeYamliSuggestions(suggestions: YamliSuggestionLike[]): string[] {
  const unique = new Set<string>();

  for (const item of suggestions) {
    const value = typeof item === "string" ? item : item?.trans ?? "";
    const candidate = value.trim();

    if (!candidate || YAMLI_UI_TEXTS.has(candidate) || !/[\u0600-\u06FF]/.test(candidate)) {
      continue;
    }

    unique.add(candidate);
    if (unique.size >= 5) {
      break;
    }
  }

  return Array.from(unique);
}

function dispatchYamliSuggestions(targetId: string, suggestions: YamliSuggestionLike[]) {
  const normalized = normalizeYamliSuggestions(suggestions);
  if (normalized.length === 0) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("qbasair:yamli-suggestions", {
      detail: {
        targetId,
        suggestions: normalized,
      },
    }),
  );
}

export function YamliInit({ targetId }: { targetId: string }) {
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let initialized = false;
    let observer: MutationObserver | null = null;

    function attachObserver() {
      if (observer || !document.body) {
        return;
      }

      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const target = mutation.target;
          if (!(target instanceof HTMLElement)) {
            continue;
          }

          const menu = target.classList.contains("yamliapi_menuContent")
            ? target
            : target.closest(".yamliapi_menuContent");

          if (!menu) {
            continue;
          }

          const texts = Array.from(menu.querySelectorAll("div"))
            .map((node) => node.textContent?.trim() ?? "")
            .filter(Boolean);

          dispatchYamliSuggestions(targetId, texts);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    function syncYamliSurfaceVisibility() {
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (!input) {
        return;
      }

      const showSurface = document.activeElement === input && /[a-zA-Z]/.test(input.value);
      document.body.classList.toggle("yamli-surface-visible", showSurface);
    }

    function hookYamliRuntime() {
      const yamli = window.Yamli;
      if (!yamli?.global?.registerTransliteration) {
        return false;
      }

      if (yamli.global._qbasairWrapped) {
        return true;
      }

      const originalRegister = yamli.global.registerTransliteration.bind(yamli.global);
      yamli.global._qbasairOriginalRegister = originalRegister;
      yamli.global._qbasairWrapped = true;

      if (yamli.global.setKeyboardEnabled) {
        yamli.global.setKeyboardEnabled(false);
      }

      yamli.global.registerTransliteration = function registerTransliteration(word, suggestions, index) {
        const result = originalRegister(word, suggestions, index);
        if (Array.isArray(suggestions)) {
          dispatchYamliSuggestions(targetId, suggestions as YamliSuggestionLike[]);
        }
        return result;
      };

      return true;
    }

    function tryInitialize() {
      if (cancelled || initialized) return;

      const input = document.getElementById(targetId) as HTMLInputElement | null;
      const yamli = window.Yamli;
      if (!input || !yamli?.init || !yamli?.yamlify) {
        attempts += 1;
        if (attempts < 50) {
          window.setTimeout(tryInitialize, 250);
        }
        return;
      }

      attachObserver();
      input.addEventListener("input", syncYamliSurfaceVisibility);
      input.addEventListener("focus", syncYamliSurfaceVisibility);
      input.addEventListener("blur", () => {
        window.setTimeout(syncYamliSurfaceVisibility, 120);
      });

      if (input.dataset.yamliBound !== "true") {
        const started = yamli.init({
          uiLanguage: "ar",
          startMode: "on",
          generateOnChangeEvent: true,
        });
        if (started) {
          yamli.yamlify(targetId, {
            settingsPlacement: "inside",
            generateOnChangeEvent: true,
          });
          input.dataset.yamliBound = "true";
        }
      }

      if (hookYamliRuntime()) {
        initialized = true;
        return;
      }

      attempts += 1;
      if (attempts < 50) {
        window.setTimeout(tryInitialize, 250);
      }
    }

    window.setTimeout(tryInitialize, 0);

    return () => {
      cancelled = true;
      document.body.classList.remove("yamli-surface-visible");
      observer?.disconnect();
    };
  }, [targetId]);

  return null;
}
