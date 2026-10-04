import type { IconName } from "@/components/icon";

import { t } from "@/lib/i18n";

/**
 * The reader toolbox: the active tool decides what a tap on the Quran text
 * does. It is an open registry — adding a tool means adding an entry here and
 * a branch in the stage's word handler; the toolbar, the phone chooser, the
 * shortcuts and the hint line all read from this list.
 */
export type ReaderToolId = "select" | "highlight";

export type ReaderTool = {
  id: ReaderToolId;
  label: string;
  icon: IconName;
  /** One line under the chooser: what a tap does with this tool. */
  hint: string;
  /** Keyboard shortcut (a single key, when focus isn't in a text field). */
  key: string;
};

// «تحديد» absorbed the former «تحليل» tool (a single picked word shows its
// analysis); the «تفسير» tool was retired (Tafssir stays in the Studio).
export const READER_TOOLS: ReaderTool[] = [
  { id: "select", get label() {
    return t("تحديد");
  }, icon: "select", get hint() {
    return t("اضغط كلمة لتحليلها، أو كلمة ثم أخرى، أو رقم الآية لتحديدها كاملة");
  }, key: "1" },
  { id: "highlight", get label() {
    return t("تظليل");
  }, icon: "highlight", get hint() {
    return t("اضغط آية: احفظها وظلِّلها بموضوع");
  }, key: "2" },
];

export const DEFAULT_READER_TOOL: ReaderToolId = "select";

export function isReaderToolId(value: unknown): value is ReaderToolId {
  return READER_TOOLS.some((tool) => tool.id === value);
}

export function toolForKey(key: string): ReaderToolId | null {
  return READER_TOOLS.find((tool) => tool.key === key)?.id ?? null;
}

export function readerTool(id: ReaderToolId): ReaderTool {
  return READER_TOOLS.find((tool) => tool.id === id) ?? READER_TOOLS[0];
}
