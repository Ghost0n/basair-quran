"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { SearchMode, SuggestionItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useIsMobile } from "@/lib/use-is-mobile";
import { looksLikeQuestion } from "@/lib/studio-prefill";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

type Row =
  | { kind: "search"; label: string; hint: string; query: string; mode: SearchMode }
  | { kind: "ask"; label: string; hint: string; question: string };

/**
 * Home's ask / search bar. A tap shows suggestions: example searches while it
 * is empty, then word / root / phrase suggestions as you type — and always, as
 * the last line, «“what you typed” — ask the researcher», which opens a new
 * Studio session with it. «ابحث» / «اسأل» stay as explicit buttons.
 */
export function HomeAsk({
  mushaf,
  examples,
  onSearch,
  onAsk,
}: {
  mushaf: number;
  examples: { label: string; query: string; mode: SearchMode }[];
  onSearch: (query: string, mode: SearchMode) => void;
  onAsk: (question: string) => void;
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [active, setActive] = useState(-1);
  // Narrow phones: the long hint no longer fits beside the icon buttons.
  const narrow = useIsMobile(480);
  const requestRef = useRef(0);

  const trimmed = value.trim();
  const isQuestion = !trimmed || looksLikeQuestion(trimmed);

  // Word / root / phrase suggestions for what's typed (debounced; questions skip it).
  useEffect(() => {
    setActive(-1);
    if (!trimmed || looksLikeQuestion(trimmed) || trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const id = ++requestRef.current;
    const timer = window.setTimeout(() => {
      api
        .getSuggestions(trimmed, "exact", mushaf)
        .then((items) => id === requestRef.current && setSuggestions(items.slice(0, 6)))
        .catch(() => id === requestRef.current && setSuggestions([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [trimmed, mushaf]);

  const typeLabel = (type: SuggestionItem["type"]) =>
    type === "root" ? t("جذر") : type === "phrase" ? t("عبارة") : t("لفظ");

  const rows: Row[] = trimmed
    ? [
        ...suggestions.map(
          (item): Row => ({
            kind: "search",
            label: item.text,
            hint: typeLabel(item.type),
            query: item.text,
            mode: item.type === "root" ? "root" : "exact",
          }),
        ),
        { kind: "ask", label: `«${trimmed}»`, hint: t("اسأل الباحث — جلسة جديدة"), question: trimmed },
      ]
    : examples.map((example): Row => ({ kind: "search", label: example.label, hint: t("جرّب"), query: example.query, mode: example.mode }));

  function run(row: Row) {
    setOpen(false);
    setValue("");
    if (row.kind === "ask") onAsk(row.question);
    else onSearch(row.query, row.mode);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (active >= 0 && rows[active]) {
      run(rows[active]);
      return;
    }
    if (!trimmed) return;
    setOpen(false);
    setValue("");
    if (looksLikeQuestion(trimmed)) onAsk(trimmed);
    else onSearch(trimmed, "exact");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? rows.length - 1 : index - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form className={`qb-home-ask${open && rows.length ? " is-open" : ""}`} onSubmit={submit} role="search">
      <Icon name="sparkles" size={18} />
      <input
        type="text"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={narrow ? t("اسأل سؤالاً أو ابحث في القرآن") : t("اسأل سؤالاً… أو اكتب جذراً/كلمة للبحث")}
        aria-label={t("اسأل سؤالاً أو ابحث في القرآن")}
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-controls="qb-home-suggest"
        aria-activedescendant={active >= 0 ? `qb-home-sg-${active}` : undefined}
        dir="auto"
      />
      <div className="acts">
        <button type="button" className={`search${isQuestion ? "" : " primary"}`} disabled={!trimmed} onClick={() => run({ kind: "search", label: trimmed, hint: "", query: trimmed, mode: "exact" })} title={t("ابحث في القرآن")} aria-label={t("ابحث في القرآن")}>
          <Icon name="search" size={15} /> <span className="lbl">{t("ابحث")}</span>
        </button>
        <button type="button" className={`ask${isQuestion ? " primary" : ""}`} disabled={!trimmed} onClick={() => run({ kind: "ask", label: trimmed, hint: "", question: trimmed })} title={t("اسأل الدراسة")} aria-label={t("اسأل الدراسة")}>
          <Icon name="sparkles" size={15} /> <span className="lbl">{t("اسأل")}</span>
        </button>
      </div>

      {open && rows.length ? (
        <div className="qb-home-suggest" id="qb-home-suggest" role="listbox">
          {rows.map((row, index) => (
            <button
              key={`${row.kind}-${row.label}-${index}`}
              id={`qb-home-sg-${index}`}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`${row.kind}${index === active ? " active" : ""}`}
              // mousedown keeps the input's focus through the click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run(row)}
            >
              <Icon name={row.kind === "ask" ? "sparkles" : "search"} size={14} />
              <span className="label" dir="auto">
                {row.label}
              </span>
              <span className="hint">{row.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
