"use client";

import type { ResearchReference, ResearchSection } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";

import { parseBlocks, type Inline } from "./markdown-lite";

const KIND_LABEL: Record<ResearchSection["kind"], string> = {
  text: "",
  ayahs: "الآيات",
  note: "ملاحظة",
  question: "سؤال",
  ai_answer: "جواب آلي",
};

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>))}
    </>
  );
}

export function RichBody({ body }: { body: string }) {
  return (
    <>
      {parseBlocks(body).map((block, index) =>
        block.kind === "p" ? (
          <p key={index}>
            <InlineText parts={block.inline} />
          </p>
        ) : (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <InlineText parts={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

/** Read-only rendering of a research document's sections and references. */
export function DocumentView({
  sections,
  references,
  surahName,
  onOpenAyah,
}: {
  sections: ResearchSection[];
  references: ResearchReference[];
  surahName: (surahId: number) => string;
  onOpenAyah?: (surahId: number, ayah: number, ayahId?: number | null) => void;
}) {
  const formatNumber = useNumerals();
  return (
    <div className="qb-docview">
      {sections.map((section) => {
        const label = KIND_LABEL[section.kind];
        const isAi = section.kind === "ai_answer";
        return (
          <section key={section.id} className={`qb-docview-section kind-${section.kind}`}>
            {section.title || label ? (
              <header>
                {label ? (
                  <span className={`badge${isAi ? " ai" : ""}`}>
                    {isAi ? <Icon name="sparkles" size={11} /> : null} {label}
                  </span>
                ) : null}
                {section.title ? <h3>{section.title}</h3> : null}
              </header>
            ) : null}
            {section.body ? (
              <div className="body">
                <RichBody body={section.body} />
              </div>
            ) : null}
            {section.ayahs.map((ref) => (
              <blockquote key={`${ref.surah_id}:${ref.ayah}`} className="ayah">
                <p>{ref.text}</p>
                <button
                  type="button"
                  className="ref"
                  onClick={() => onOpenAyah?.(ref.surah_id, ref.ayah, ref.ayah_id)}
                  disabled={!onOpenAyah}
                >
                  ﴿{surahName(ref.surah_id)}: {formatNumber(ref.ayah)}﴾
                </button>
              </blockquote>
            ))}
          </section>
        );
      })}
      {references.length ? (
        <section className="qb-docview-refs">
          <h3>المراجع</h3>
          <ul>
            {references.map((reference, index) => (
              <li key={index}>
                {reference.label}
                {reference.locator ? <span className="loc"> — {reference.locator}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
