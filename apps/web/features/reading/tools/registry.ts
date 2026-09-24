import type { IconName } from "@/components/icon";

/**
 * The reader toolbox: the active tool decides what a tap on the Quran text
 * does. It is an open registry — adding a tool means adding an entry here and
 * a branch in the stage's word handler; the toolbar, the phone chooser, the
 * shortcuts and the hint line all read from this list.
 */
export type ReaderToolId = "grammar" | "highlight" | "select" | "tafssir";

export type ReaderTool = {
  id: ReaderToolId;
  label: string;
  icon: IconName;
  /** One line under the chooser: what a tap does with this tool. */
  hint: string;
  /** Keyboard shortcut (a single key, when focus isn't in a text field). */
  key: string;
};

export const READER_TOOLS: ReaderTool[] = [
  { id: "grammar", label: "تحليل", icon: "tree", hint: "اضغط كلمة: الجذر والأصل والإعراب", key: "1" },
  { id: "highlight", label: "تظليل", icon: "highlight", hint: "اضغط آية: احفظها وظلِّلها بموضوع", key: "2" },
  { id: "select", label: "تحديد", icon: "select", hint: "اضغط كلمة ثم أخرى: ابحث، اسأل، أحصِ، انسخ", key: "3" },
  { id: "tafssir", label: "تفسير", icon: "feather", hint: "اضغط آية: قراءة تفسيرية تجريبية في سياقها", key: "4" },
];

export const DEFAULT_READER_TOOL: ReaderToolId = "grammar";

export function isReaderToolId(value: unknown): value is ReaderToolId {
  return READER_TOOLS.some((tool) => tool.id === value);
}

export function toolForKey(key: string): ReaderToolId | null {
  return READER_TOOLS.find((tool) => tool.key === key)?.id ?? null;
}

export function readerTool(id: ReaderToolId): ReaderTool {
  return READER_TOOLS.find((tool) => tool.id === id) ?? READER_TOOLS[0];
}
