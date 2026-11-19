"use client";

import "@xyflow/react/dist/style.css";
import "@/features/themes/themes.css";
import "./board.css";
import "./board.web.css";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { goTo } from "@/features/shell/navigation";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { NotebookItem, ThemeBoard, ThemeBoardEntry, ThemeDetail } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useBackToNotebook, useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useStickyState } from "@/lib/use-sticky-state";
import { useTopBarSlots } from "@/features/shell/top-bar-slots";

import {
  RELATION_LABELS,
  arrangeBoard,
  ayahNodeId,
  newNodeId,
  boardSet,
  newBoardEntry,
  putBoard,
  readBoards,
  reconcileBoard,
  splitEdges,
} from "./board-model";
import { rememberLastBoard } from "./last-board";
import { BoardContext, type BoardContextValue } from "./board-context";
import { AyahNode, HeadingNode, NoteNode, ShapeNode } from "./board-nodes";
import { BOARD_COLORS, BOARD_FONTS, BOARD_SIZES, readStyle, type BoardNodeStyle, type BoardShape } from "./board-style";
import { documentFromBoard } from "@/features/documents/convert";
import { createDocumentUrl } from "@/features/documents/open-document";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const NODE_TYPES = { ayah: AyahNode, note: NoteNode, heading: HeadingNode, shape: ShapeNode };

const SHAPES: { value: BoardShape; get label(): string }[] = [
  { value: "rect", get label() {
    return t("مستطيل");
  } },
  { value: "ellipse", get label() {
    return t("شكل بيضاوي");
  } },
  { value: "diamond", get label() {
    return t("معيّن");
  } },
];

/** The shape as a drawn outline with a soft fill (the menu's preview). */
function ShapeIcon({ shape }: { shape: BoardShape }) {
  return (
    <svg className="qb-shape-icon" viewBox="0 0 40 28" width={40} height={28} aria-hidden>
      {shape === "ellipse" ? (
        <ellipse cx="20" cy="14" rx="17" ry="11.5" />
      ) : shape === "diamond" ? (
        <polygon points="20,2 37,14 20,26 3,14" />
      ) : (
        <rect x="3" y="3.5" width="34" height="21" rx="4" />
      )}
    </svg>
  );
}
const SAVE_DELAY_MS = 900;
/** Undo depth. */
const HISTORY_STEPS = 7;

type SaveState = "idle" | "saving" | "saved" | "error";

function toFlow(board: ThemeBoard): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: board.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.x, y: node.y },
      data: node.data,
      // Ayah nodes mirror the theme's ayahs: remove the theme from an ayah to drop it.
      deletable: node.type !== "ayah",
      ...(node.w ? { width: node.w } : {}),
      ...(node.h ? { height: node.h } : {}),
    })),
    edges: board.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label ?? undefined,
    })),
  };
}

/** Where a new note/heading goes: under everything, aligned to the left-most column. */
function freeSpot(nodes: Node[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  const left = Math.min(...nodes.map((node) => node.position.x));
  const bottom = Math.max(...nodes.map((node) => node.position.y + (node.measured?.height ?? node.height ?? 160)));
  return { x: Math.round(left), y: Math.round(bottom + 48) };
}

function toBoard(nodes: Node[], edges: Edge[]): ThemeBoard {
  return {
    v: 1,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type as "ayah" | "note" | "heading" | "shape",
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      ...(node.width && node.type !== "ayah" ? { w: Math.round(node.width) } : {}),
      ...(node.height && (node.type === "note" || node.type === "shape") ? { h: Math.round(node.height) } : {}),
      data: node.data as Record<string, unknown>,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === "string" && edge.label ? edge.label : null,
    })),
    viewport: null,
  };
}

type StyleCategory = "color" | "bg" | "border" | "borderColor" | "size" | "font";

/**
 * Phones: the same styling as StylePanel, as a compact strip at the bottom —
 * one scrolling row of categories, and one scrolling row with the chosen
 * category's options — so the styled element stays visible above it.
 */
function StyleStrip({
  style,
  canDelete,
  onChange,
  onDelete,
  onHide,
  onClose,
}: {
  style: BoardNodeStyle;
  canDelete: boolean;
  onChange: (patch: Partial<BoardNodeStyle> | null) => void;
  onDelete: () => void;
  /** Selected ayahs: take them off the board (they stay in the theme). */
  onHide?: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useStickyState<StyleCategory>("qb.board.styleCategory", "color", [
    "color",
    "bg",
    "border",
    "borderColor",
    "size",
    "font",
  ]);
  const categories: { value: StyleCategory; label: string }[] = [
    { value: "color", label: t("لون النص") },
    { value: "bg", label: t("الخلفية") },
    { value: "border", label: t("الإطار") },
    { value: "borderColor", label: t("لون الإطار") },
    { value: "size", label: t("الحجم") },
    { value: "font", label: t("الخط") },
  ];

  const swatches = (key: "color" | "bg" | "borderColor") => (
    <>
      <button
        type="button"
        className={`swatch none${style[key] ? "" : " on"}`}
        aria-label={t("افتراضي")}
        onClick={() => onChange({ [key]: undefined })}
      />
      {BOARD_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`swatch${style[key] === color ? " on" : ""}`}
          style={{ "--sw": color } as CSSProperties}
          aria-label={color}
          aria-pressed={style[key] === color}
          onClick={() => onChange({ [key]: color })}
        />
      ))}
    </>
  );

  const toggle = <K extends "border" | "size" | "font">(key: K, value: NonNullable<BoardNodeStyle[K]>) =>
    onChange({ [key]: style[key] === value ? undefined : value } as Partial<BoardNodeStyle>);

  return (
    <div className="qb-style-strip nodrag nowheel" role="dialog" aria-label={t("تنسيق العنصر")}>
      <div className="cats" role="tablist">
        {categories.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={category === entry.value}
            className={category === entry.value ? "on" : ""}
            onClick={() => setCategory(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="opts">
        {category === "color" || category === "bg" || category === "borderColor" ? swatches(category) : null}
        {category === "border"
          ? (["solid", "dashed", "none"] as const).map((border) => (
              <button key={border} type="button" className={`chip${style.border === border ? " on" : ""}`} onClick={() => toggle("border", border)}>
                {border === "solid" ? t("متصل") : border === "dashed" ? t("متقطّع") : t("بلا")}
              </button>
            ))
          : null}
        {category === "size"
          ? BOARD_SIZES.map((size) => (
              <button key={size.value} type="button" className={`chip${style.size === size.value ? " on" : ""}`} onClick={() => toggle("size", size.value)}>
                {size.label}
              </button>
            ))
          : null}
        {category === "font"
          ? BOARD_FONTS.map((font) => (
              <button
                key={font.value}
                type="button"
                className={`chip${style.font === font.value ? " on" : ""}`}
                style={{ fontFamily: font.family }}
                onClick={() => toggle("font", font.value)}
              >
                {font.label}
              </button>
            ))
          : null}
        <span className="sep" aria-hidden />
        <button type="button" className="chip" onClick={() => onChange(null)} title={t("إعادة التنسيق")} aria-label={t("إعادة التنسيق")}>
          <Icon name="repeat" size={14} />
        </button>
        {onHide ? (
          <button type="button" className="chip" onClick={onHide} aria-label={t("إخفاء من اللوحة")}>
            <Icon name="eyeOff" size={14} />
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" className="chip danger" onClick={onDelete} aria-label={t("حذف")}>
            <Icon name="trash" size={14} />
          </button>
        ) : null}
        <button type="button" className="chip" onClick={onClose} aria-label={t("إغلاق")}>
          <Icon name="check" size={14} />
        </button>
      </div>
    </div>
  );
}

/** Look of the selected node(s): text colour, fill, border, size, font. */
function StylePanel({
  count,
  style,
  canDelete,
  onChange,
  onDelete,
  onHide,
  onClose,
}: {
  count: number;
  style: BoardNodeStyle;
  canDelete: boolean;
  onChange: (patch: Partial<BoardNodeStyle> | null) => void;
  onDelete: () => void;
  onHide?: () => void;
  /** Phones: the panel is a sheet that can be dismissed. */
  onClose?: () => void;
}) {
  const swatches = (key: "color" | "bg" | "borderColor", withNone: boolean) => (
    <div className="opts">
      {withNone ? (
        <button
          type="button"
          className={`swatch none${style[key] ? "" : " on"}`}
          aria-label={t("افتراضي")}
          title={t("افتراضي")}
          onClick={() => onChange({ [key]: undefined })}
        />
      ) : null}
      {BOARD_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`swatch${style[key] === color ? " on" : ""}`}
          style={{ "--sw": color } as CSSProperties}
          aria-label={color}
          aria-pressed={style[key] === color}
          onClick={() => onChange({ [key]: color })}
        />
      ))}
    </div>
  );
  return (
    <div className="qb-style-panel nodrag nowheel" role="dialog" aria-label={t("تنسيق العنصر")}>
      <div className="head">
        <span>{count > 1 ? t("تنسيق {0} عناصر", { 0: count }) : t("تنسيق العنصر")}</span>
        {onClose ? (
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={15} />
          </button>
        ) : null}
      </div>
      <div className="row">
        <span className="lbl">{t("لون النص")}</span>
        {swatches("color", true)}
      </div>
      <div className="row">
        <span className="lbl">{t("الخلفية")}</span>
        {swatches("bg", true)}
      </div>
      <div className="row">
        <span className="lbl">{t("الإطار")}</span>
        <div className="opts">
          {(["solid", "dashed", "none"] as const).map((border) => (
            <button key={border} type="button" className={style.border === border ? "on" : ""} onClick={() => onChange({ border: style.border === border ? undefined : border })}>
              {border === "solid" ? t("متصل") : border === "dashed" ? t("متقطّع") : t("بلا")}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span className="lbl">{t("لون الإطار")}</span>
        {swatches("borderColor", true)}
      </div>
      <div className="row">
        <span className="lbl">{t("الحجم")}</span>
        <div className="opts">
          {BOARD_SIZES.map((size) => (
            <button key={size.value} type="button" className={style.size === size.value ? "on" : ""} onClick={() => onChange({ size: style.size === size.value ? undefined : size.value })}>
              {size.label}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span className="lbl">{t("الخط")}</span>
        <div className="opts">
          {BOARD_FONTS.map((font) => (
            <button
              key={font.value}
              type="button"
              className={style.font === font.value ? "on" : ""}
              style={{ fontFamily: font.family }}
              onClick={() => onChange({ font: style.font === font.value ? undefined : font.value })}
            >
              {font.label}
            </button>
          ))}
        </div>
      </div>
      <div className="foot">
        <button type="button" onClick={() => onChange(null)}>
          {t("إعادة التنسيق")}
        </button>
        {onHide ? (
          <button type="button" onClick={onHide} title={t("إخفاء من اللوحة (تبقى في الموضوع)")}>
            <Icon name="eyeOff" size={13} /> {t("إخفاء")}
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" className="danger" onClick={onDelete}>
            <Icon name="trash" size={13} /> {t("حذف")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The theme's ayahs with their board status: shown, or hidden (still saved). */
function VersesPanel({
  items,
  hidden,
  onHide,
  onShow,
  onClose,
}: {
  items: NotebookItem[];
  hidden: string[];
  onHide: (nodeId: string) => void;
  onShow: (item: NotebookItem) => void;
  onClose: () => void;
}) {
  const formatNumber = useNumerals();
  const off = new Set(hidden);
  const ordered = [...items].sort((a, b) => (a.surah_id ?? 0) * 1000 + (a.ayah ?? 0) - ((b.surah_id ?? 0) * 1000 + (b.ayah ?? 0)));
  return (
    <div className="qb-verses-panel nodrag nowheel" role="dialog" aria-label={t("آيات الموضوع")}>
      <div className="head">
        <span>{t("آيات الموضوع")}</span>
        <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {ordered.length === 0 ? <p className="empty">{t("لا آيات في الدفتر بعد.")}</p> : null}
      <ul>
        {ordered.map((item) => {
          const id = ayahNodeId(item);
          const isHidden = off.has(id);
          return (
            <li key={id} className={isHidden ? "is-hidden" : ""}>
              <div className="meta">
                <span className="ref">
                  {item.surah ?? ""} {item.ayah != null ? formatNumber(item.ayah) : ""}
                </span>
                <span className="text">{item.text}</span>
              </div>
              <button
                type="button"
                aria-pressed={!isHidden}
                aria-label={isHidden ? t("إظهار في اللوحة") : t("إخفاء من اللوحة")}
                title={isHidden ? t("إظهار في اللوحة") : t("إخفاء من اللوحة")}
                onClick={() => (isHidden ? onShow(item) : onHide(id))}
              >
                <Icon name={isHidden ? "eyeOff" : "eye"} size={15} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * لوحة الموضوع — a theme's ayahs as a canvas the researcher organises: drag
 * ayahs into place, add notes and headings, and draw labelled relations
 * between them. An ayah expands into a scrollable mini reader (its passage).
 * The whole board autosaves as the theme's metadata.
 */
export function BoardScreen() {
  return (
    <ReactFlowProvider>
      <Board />
    </ReactFlowProvider>
  );
}

function Board() {
  const params = useSearchParams();
  // The web design: the bar's name and tools live in the top bar.
  const topSlots = useTopBarSlots();
  const themeId = Number(params.get("theme"));
  const boardParam = params.get("board");
  // The theme's boards as loaded/saved, and the one on this canvas.
  const boardsRef = useRef<ThemeBoardEntry[]>([]);
  const entryRef = useRef<ThemeBoardEntry | null>(null);
  const [boardName, setBoardName] = useState("");
  const boardNameRef = useRef(boardName);
  boardNameRef.current = boardName;
  const { setMode } = useShellMode();
  const backToNotebook = useBackToNotebook("boards");
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const flow = useReactFlow();
  const { state: workspace } = useWorkspace();
  const router = useRouter();

  const [theme, setTheme] = useState<ThemeDetail | null>(null);
  const [items, setItems] = useState<NotebookItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [editingEdge, setEditingEdge] = useState<string | null>(null);
  const [shapeMenu, setShapeMenu] = useState(false);
  // Phones: the style panel would cover half the canvas, so a selection shows a
  // small «تنسيق» pill that opens it as a sheet above the tab bar.
  const compact = useIsMobile(768);
  const [styleSheet, setStyleSheet] = useState(false);
  // The view before «تنسيق» zoomed onto the element (restored when it closes).
  const styleViewportRef = useRef<Viewport | null>(null);
  const [edgeText, setEdgeText] = useState("");
  const lastSavedRef = useRef<string>("");
  const loadedRef = useRef(false);
  // Ayahs hidden from the board (still in the theme) and their parked relations.
  const [hidden, setHidden] = useState<string[]>([]);
  const [parked, setParked] = useState<Edge[]>([]);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const parkedRef = useRef(parked);
  parkedRef.current = parked;
  const [versesOpen, setVersesOpen] = useState(false);
  const shapeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [shapeMenuStyle, setShapeMenuStyle] = useState<CSSProperties>({});

  /** The board as persisted: visible nodes/edges, parked relations, hidden ids. */
  const snapshot = useCallback((): ThemeBoard => {
    const nodesNow = flow.getNodes();
    const known = new Set([...nodesNow.map((node) => node.id), ...hiddenRef.current]);
    const parkedNow = parkedRef.current.filter((edge) => known.has(edge.source) && known.has(edge.target));
    return { ...toBoard(nodesNow, [...flow.getEdges(), ...parkedNow]), hidden: hiddenRef.current };
  }, [flow]);

  /** Put a stored board on the canvas (load, undo, redo). */
  const applyBoard = useCallback(
    (board: ThemeBoard) => {
      const split = splitEdges(board.edges, board.hidden ?? []);
      setNodes(toFlow({ ...board, edges: [] }).nodes);
      setEdges(toFlow({ ...board, nodes: [], edges: split.shown }).edges);
      setParked(toFlow({ ...board, nodes: [], edges: split.parked }).edges);
      setHidden(board.hidden ?? []);
    },
    [setNodes, setEdges],
  );

  // Load the theme (with its board) and its ayahs, then reconcile.
  useEffect(() => {
    if (!Number.isInteger(themeId) || themeId <= 0) {
      setStatus("missing");
      return;
    }
    // The URL just caught up with the board already on the canvas (its id was
    // added after opening): nothing to load.
    if (loadedRef.current && boardParam && entryRef.current?.id === boardParam && theme?.id === themeId) return;
    let cancelled = false;
    loadedRef.current = false;
    setStatus("loading");
    Promise.all([api.getTheme(themeId), api.getNotebook()])
      .then(([detail, notebook]) => {
        if (cancelled) return;
        const themed = notebook.filter((item) => item.theme_ids?.includes(themeId));
        // Which board: the one named in the URL; an old link (theme only) opens
        // the theme's first board, or starts one when it has none.
        let boards = readBoards(detail.board, detail.name);
        let entry = boardParam ? boards.find((item) => item.id === boardParam) : boards[0];
        if (boardParam && !entry) {
          setStatus("missing");
          return;
        }
        const created = !entry;
        if (!entry) {
          entry = newBoardEntry(detail.name);
          boards = [entry];
        }
        if (entry.id !== boardParam) {
          const sp = new URLSearchParams(window.location.search);
          sp.set("board", entry.id);
          goTo(`/?${sp.toString()}`, true);
        }
        boardsRef.current = boards;
        entryRef.current = entry;
        setBoardName(entry.name);
        const board = reconcileBoard(entry.board, themed);
        setTheme(detail);
        setItems(themed);
        applyBoard(board);
        historyRef.current = { stack: [], index: -1 };
        // A board just started saves at once (so it exists); an opened one only
        // when it changes.
        lastSavedRef.current = created ? "" : JSON.stringify([entry.name, entry.board]);
        if (!created) rememberLastBoard({ theme: detail.id, board: entry.id, name: entry.name, themeName: detail.name, color: detail.color });
        setStatus("ready");
        loadedRef.current = true;
        // Always fit on open: a saved viewport from another screen size would
        // leave the ayahs off-screen (e.g. desktop → phone).
        window.setTimeout(() => void flow.fitView({ padding: 0.2, maxZoom: 1 }), 50);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const notFound = err instanceof Error && /404/.test(err.message);
        setStatus(notFound ? "missing" : "error");
      });
    return () => {
      cancelled = true;
    };
    // flow is stable; setNodes/setEdges are stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, boardParam]);

  // Debounced autosave whenever the board's persisted content changes: this
  // board is written back into the theme's set of boards.
  const save = useCallback(async () => {
    if (!loadedRef.current || !theme || !entryRef.current) return;
    const board = snapshot();
    const name = boardNameRef.current.trim() || theme.name;
    const encoded = JSON.stringify([name, board]);
    if (encoded === lastSavedRef.current) return;
    setSaveState("saving");
    try {
      const entry = { ...entryRef.current, name, board };
      const next = putBoard(boardsRef.current, entry);
      await api.saveThemeBoard(theme.id, boardSet(next));
      boardsRef.current = next;
      entryRef.current = entry;
      lastSavedRef.current = encoded;
      rememberLastBoard({ theme: theme.id, board: entry.id, name, themeName: theme.name, color: theme.color });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [snapshot, theme]);

  const persistKey = useMemo(
    () =>
      JSON.stringify([
        nodes.map((node) => [
          node.id,
          Math.round(node.position.x),
          Math.round(node.position.y),
          node.width,
          node.height,
          node.data,
        ]),
        edges.map((edge) => [edge.id, edge.source, edge.target, edge.label]),
        hidden,
        parked.map((edge) => edge.id),
        boardName,
      ]),
    [nodes, edges, hidden, parked, boardName],
  );

  // Undo / redo: the last few persisted states (current + 7 steps back). A
  // restored state encodes identically, so restoring never records itself.
  const historyRef = useRef<{ stack: string[]; index: number }>({ stack: [], index: -1 });
  const [, setHistoryTick] = useState(0);
  useEffect(() => {
    if (status !== "ready") return;
    const timer = window.setTimeout(() => {
      const encoded = JSON.stringify(snapshot());
      const history = historyRef.current;
      if (history.stack[history.index] === encoded) return;
      history.stack = [...history.stack.slice(0, history.index + 1), encoded].slice(-HISTORY_STEPS - 1);
      history.index = history.stack.length - 1;
      setHistoryTick((tick) => tick + 1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [persistKey, status, snapshot]);

  const canUndo = historyRef.current.index > 0;
  const canRedo = historyRef.current.index < historyRef.current.stack.length - 1;

  function stepHistory(delta: -1 | 1) {
    const history = historyRef.current;
    const target = history.index + delta;
    if (target < 0 || target >= history.stack.length) return;
    history.index = target;
    applyBoard(JSON.parse(history.stack[target]) as ThemeBoard);
    setEditingEdge(null);
    setHistoryTick((tick) => tick + 1);
  }
  const stepRef = useRef(stepHistory);
  stepRef.current = stepHistory;

  // ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo — not while typing in a note.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        stepRef.current(event.shiftKey ? 1 : -1);
      } else if (key === "y") {
        event.preventDefault();
        stepRef.current(1);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const saveTimer = useRef<number | null>(null);
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  }, [save]);
  useEffect(() => {
    if (status === "ready") scheduleSave();
  }, [persistKey, status, scheduleSave]);
  // Flush a pending save when leaving the board.
  useEffect(
    () => () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        void save();
      }
    },
    [save],
  );

  const itemsByNode = useMemo(() => new Map(items.map((item) => [ayahNodeId(item), item])), [items]);

  const context: BoardContextValue = useMemo(
    () => ({
      themeColor: theme?.color ?? "green",
      itemFor: (nodeId) => itemsByNode.get(nodeId) ?? null,
      updateData: (nodeId, patch) =>
        setNodes((current) =>
          current.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node)),
        ),
      openInReader: (item) => {
        void mushaf.loadByAyah(item.mushaf_id || 2, item.ayah_id, []);
        setMode("reading");
      },
    }),
    [theme?.color, itemsByNode, setNodes, mushaf, setMode],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const id = newNodeId("e");
      setEdges((current) => addEdge({ ...connection, id }, current));
      setEditingEdge(id);
      setEdgeText("");
    },
    [setEdges],
  );

  // The shape menu is portaled (the bar's glass would trap a fixed menu) and
  // placed under its button, kept on screen.
  function toggleShapeMenu() {
    const button = shapeButtonRef.current;
    if (!shapeMenu && button) {
      const rect = button.getBoundingClientRect();
      const width = 3 * 64 + 16;
      const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 8), window.innerWidth - width - 8);
      setShapeMenuStyle({ top: rect.bottom + 8, left, width });
    }
    setShapeMenu((open) => !open);
  }

  function addNode(type: "note" | "heading" | "shape", shape?: BoardShape) {
    const id = newNodeId(type === "note" ? "n" : type === "shape" ? "s" : "h");
    const position = freeSpot(flow.getNodes());
    setShapeMenu(false);
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      {
        id,
        type,
        position,
        data: { text: "", autoFocus: true, ...(shape ? { shape } : {}) },
        selected: true,
        ...(type === "shape" ? { width: 180, height: shape === "diamond" ? 140 : 110 } : {}),
      },
    ]);
    // Bring the new node into view (it lands below the current content).
    window.setTimeout(() => void flow.setCenter(position.x + 140, position.y + 60, { duration: 250, zoom: flow.getZoom() }), 30);
  }

  function arrange() {
    const byReading = (nodeId: string) => {
      const item = itemsByNode.get(nodeId);
      return item ? (item.surah_id ?? 0) * 1000 + (item.ayah ?? 0) : Number.MAX_SAFE_INTEGER;
    };
    const arranged = arrangeBoard(toBoard(flow.getNodes(), flow.getEdges()), byReading);
    setNodes(toFlow(arranged).nodes);
    window.requestAnimationFrame(() => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }));
  }

  // «صدّر كبحث»: the board (headings → sections, notes, relations) becomes a research document.
  const [exporting, setExporting] = useState(false);
  async function exportAsDocument() {
    if (!theme || exporting) return;
    setExporting(true);
    try {
      await save();
      const board = toBoard(flow.getNodes(), flow.getEdges());
      const source = entryRef.current ? { boardId: entryRef.current.id, name: boardName.trim() || theme.name } : undefined;
      router.push(await createDocumentUrl(documentFromBoard(theme, board, items, ayahNodeId, source)));
    } catch {
      setSaveState("error");
    } finally {
      setExporting(false);
    }
  }

  // Selection-driven tools: delete, and the style panel.
  const selectedNodes = nodes.filter((node) => node.selected);
  const hasSelection = selectedNodes.length > 0;
  const selectedAyahIds = selectedNodes.filter((node) => node.type === "ayah").map((node) => node.id);
  const closeRef = useRef<() => void>(() => {});
  // Clicking the empty board deselects — that closes the style strip too.
  useEffect(() => {
    if (!hasSelection) closeRef.current();
  }, [hasSelection]);

  /** Take ayahs off the board (they stay saved in the theme); their relations park. */
  function hideAyahs(ids: string[]) {
    if (ids.length === 0) return;
    const off = new Set(ids);
    const touching = flow.getEdges().filter((edge) => off.has(edge.source) || off.has(edge.target));
    setParked((current) => [...current, ...touching]);
    setEdges((current) => current.filter((edge) => !off.has(edge.source) && !off.has(edge.target)));
    setNodes((current) => current.filter((node) => !off.has(node.id)));
    setHidden((current) => [...new Set([...current, ...ids])]);
    closeStyleSheet();
  }

  /** Put a hidden ayah back (below the content), with its parked relations. */
  function showAyah(item: NotebookItem) {
    const id = ayahNodeId(item);
    const nextHidden = hidden.filter((entry) => entry !== id);
    // Already on the board (a stale list): only clear the hidden flag.
    if (flow.getNodes().some((node) => node.id === id)) {
      setHidden(nextHidden);
      return;
    }
    const present = new Set([...flow.getNodes().map((node) => node.id), id]);
    const back = parked.filter((edge) => present.has(edge.source) && present.has(edge.target));
    const position = freeSpot(flow.getNodes());
    setNodes((current) => [
      ...current,
      { id, type: "ayah", position, data: { ayah_id: item.ayah_id, mushaf_id: item.mushaf_id }, deletable: false },
    ]);
    setEdges((current) => [...current, ...back]);
    setParked((current) => current.filter((edge) => !back.includes(edge)));
    setHidden(nextHidden);
  }
  const deletableSelection = selectedNodes.filter((node) => node.type !== "ayah").length + edges.filter((edge) => edge.selected).length;

  function deleteSelection() {
    void flow.deleteElements({
      nodes: flow.getNodes().filter((node) => node.selected && node.type !== "ayah"),
      edges: flow.getEdges().filter((edge) => edge.selected),
    });
  }

  // Phones: open the style strip and zoom onto the styled element in the upper
  // half of the canvas (clear, and in view above the strip). Closing it — ✓,
  // or a tap on the empty board — returns to the view from before.
  function openStyleSheet() {
    setStyleSheet(true);
    const node = flow.getNodes().find((entry) => entry.selected);
    const canvas = document.querySelector<HTMLElement>(".qb-board-canvas");
    if (!node || !canvas) return;
    styleViewportRef.current = flow.getViewport();
    const width = node.measured?.width ?? node.width ?? 200;
    const height = node.measured?.height ?? node.height ?? 100;
    // Fill ~80% of the width, but keep the whole element in the upper half.
    const zoom = Math.min(1.8, Math.max(0.6, Math.min((canvas.clientWidth * 0.8) / width, (canvas.clientHeight * 0.42) / height)));
    // setCenter centres the point; aim a quarter-height lower so the element
    // lands around the canvas's upper quarter.
    const x = node.position.x + width / 2;
    const y = node.position.y + height / 2 + canvas.clientHeight / 4 / zoom;
    void flow.setCenter(x, y, { zoom, duration: 300 });
  }

  function closeStyleSheet() {
    setStyleSheet(false);
    const previous = styleViewportRef.current;
    styleViewportRef.current = null;
    if (previous) void flow.setViewport(previous, { duration: 260 });
  }
  closeRef.current = closeStyleSheet;

  function applyStyle(patch: Partial<BoardNodeStyle> | null) {
    const ids = new Set(selectedNodes.map((node) => node.id));
    setNodes((current) =>
      current.map((node) => {
        if (!ids.has(node.id)) return node;
        const style = patch === null ? {} : { ...readStyle(node.data), ...patch };
        for (const key of Object.keys(style) as (keyof BoardNodeStyle)[]) if (style[key] === undefined) delete style[key];
        return { ...node, data: { ...node.data, style } };
      }),
    );
  }

  function setEdgeLabel(edgeId: string, label: string) {
    setEdges((current) => current.map((edge) => (edge.id === edgeId ? { ...edge, label: label || undefined } : edge)));
    setEditingEdge(null);
  }

  function removeEdge(edgeId: string) {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
    setEditingEdge(null);
  }

  if (status === "missing") {
    return (
      <div className="qb-board-state">
        <p>{t("لم يُعثر على هذا الموضوع.")}</p>
        <button type="button" onClick={backToNotebook}>{t("العودة إلى الدفتر")}</button>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="qb-board-state">
        <p>{t("تعذّر تحميل اللوحة.")}</p>
        <button type="button" onClick={() => window.location.reload()}>{t("إعادة المحاولة")}</button>
      </div>
    );
  }

  const ayahCount = items.length;
  const saveLabel =
    saveState === "saving" ? t("جارٍ الحفظ…") : saveState === "error" ? t("تعذّر الحفظ") : saveState === "saved" ? t("محفوظ") : "";

  const barBack = (
    <button type="button" className="back" onClick={backToNotebook} aria-label={t("العودة إلى الدفتر")}>
            <Icon name="chevRight" size={18} />
          </button>
  );
  const barTitle = (
    <div className="title">
            <span className="dot" aria-hidden />
            <input
              className="board-name"
              value={boardName}
              onChange={(event) => setBoardName(event.target.value.slice(0, 80))}
              placeholder={theme?.name ?? "…"}
              aria-label={t("اسم اللوحة")}
              dir="auto"
            />
            {theme ? <span className="theme-name">{theme.name}</span> : null}
            <span className="meta">
              {t("لوحة الموضوع،")} {formatNumber(ayahCount)} {ayahCount === 1 ? t("آية") : t("آيات")}
            </span>
          </div>
  );
  const barTools = (
    <div className="tools">
            <button type="button" onClick={() => stepHistory(-1)} disabled={!canUndo} title={t("تراجع (Ctrl+Z)")} aria-label={t("تراجع")}>
              <Icon name="undo" size={15} /> <span className="lbl">{t("تراجع")}</span>
            </button>
            <button type="button" onClick={() => stepHistory(1)} disabled={!canRedo} title={t("إعادة (Ctrl+Y)")} aria-label={t("إعادة")}>
              <Icon name="redo" size={15} /> <span className="lbl">{t("إعادة")}</span>
            </button>
            <span className="tools-sep" aria-hidden />
            <button type="button" onClick={() => addNode("note")} title={t("ملاحظة")}>
              <Icon name="edit" size={15} /> <span className="lbl">{t("ملاحظة")}</span>
            </button>
            <button type="button" onClick={() => addNode("heading")} title={t("عنوان")}>
              <Icon name="flag" size={15} /> <span className="lbl">{t("عنوان")}</span>
            </button>
            <button type="button" ref={shapeButtonRef} onClick={toggleShapeMenu} aria-haspopup="menu" aria-expanded={shapeMenu} title={t("شكل")}>
              <Icon name="shapes" size={15} /> <span className="lbl">{t("شكل")}</span>
            </button>
            <button
              type="button"
              className={versesOpen ? "on" : ""}
              onClick={() => setVersesOpen((open) => !open)}
              aria-pressed={versesOpen}
              title={t("آيات الموضوع: أظهِر أو أخفِ")}
            >
              <Icon name="eye" size={15} /> <span className="lbl">{t("الآيات")}</span>
              {hidden.length ? <span className="badge">{formatNumber(hidden.length)}</span> : null}
            </button>
            <button
              type="button"
              onClick={deleteSelection}
              disabled={deletableSelection === 0}
              title={t("حذف المحدَّد (Delete) — الآيات تُزال بإزالة الموضوع عنها")}
            >
              <Icon name="trash" size={15} /> <span className="lbl">{t("حذف")}</span>
            </button>
            <button type="button" onClick={arrange} title={t("ترتيب الآيات حسب ترتيب المصحف")}>
              <Icon name="layers" size={15} /> <span className="lbl">{t("ترتيب")}</span>
            </button>
            <button type="button" onClick={() => void exportAsDocument()} disabled={exporting || items.length === 0} title={t("صدّر كبحث")}>
              <Icon name="page" size={15} /> <span className="lbl">{t("صدّر كبحث")}</span>
            </button>
            <span className={`save ${saveState}`} role="status" aria-live="polite">
              {saveLabel}
            </span>
          </div>
  );

  return (
    <BoardContext.Provider value={context}>
      <div className="qb-board" data-hl={theme?.color ?? undefined}>
        {shapeMenu && typeof document !== "undefined"
            ? createPortal(
                <>
                  <div className="qb-shape-menu-scrim" onClick={() => setShapeMenu(false)} aria-hidden />
                  <div className="qb-shape-menu" role="menu" aria-label={t("شكل")} style={shapeMenuStyle}>
                    {SHAPES.map((shape) => (
                      <button key={shape.value} type="button" role="menuitem" onClick={() => addNode("shape", shape.value)}>
                        <ShapeIcon shape={shape.value} />
                        <span>{shape.label}</span>
                      </button>
                    ))}
                  </div>
                </>,
                document.body,
              )
            : null}
        {topSlots ? (
          <>
            {createPortal(<div className="qb-board-bar in-topbar">{barBack}{barTitle}</div>, topSlots.start)}
            {createPortal(<div className="qb-board-bar in-topbar">{barTools}</div>, topSlots.end)}
          </>
        ) : (
          <div className="qb-board-bar">
            {barBack}
            {barTitle}
            {barTools}
          </div>
        )}

        <div className="qb-board-canvas" dir="ltr">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={(_, edge) => {
              setEditingEdge(edge.id);
              setEdgeText(typeof edge.label === "string" ? edge.label : "");
            }}
            // Match the app theme: React Flow's default "light" class would pull
            // the app's light tokens into the canvas in dark mode.
            forceColorMode={workspace.theme === "light" ? "light" : "dark"}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }}
            deleteKeyCode={["Backspace", "Delete"]}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            {/* Phones pinch to zoom; the buttons would sit under the tab bar. */}
            {compact ? null : <Controls showInteractive={false} position="bottom-left" />}
            <MiniMap pannable zoomable position="bottom-right" className="qb-board-minimap" />

            {status === "loading" ? (
              <Panel position="top-center">
                <div className="qb-board-hint">{t("جارٍ تحميل اللوحة…")}</div>
              </Panel>
            ) : ayahCount === 0 ? (
              <Panel position="top-center">
                <div className="qb-board-hint">
                  {t("لا آيات في هذا الموضوع بعد. ظلِّل آيات بهذا الموضوع من القراءة (أداة «تظليل») لتظهر هنا.")}
                </div>
              </Panel>
            ) : null}

            {selectedNodes.length > 0 && !editingEdge && !compact ? (
              <Panel position="top-right">
                <StylePanel
                  count={selectedNodes.length}
                  style={readStyle(selectedNodes[0].data)}
                  canDelete={deletableSelection > 0}
                  onChange={applyStyle}
                  onDelete={deleteSelection}
                  onHide={selectedAyahIds.length ? () => hideAyahs(selectedAyahIds) : undefined}
                />
              </Panel>
            ) : null}

            {versesOpen ? (
              <Panel position="top-left">
                <VersesPanel items={items} hidden={hidden} onHide={(id) => hideAyahs([id])} onShow={showAyah} onClose={() => setVersesOpen(false)} />
              </Panel>
            ) : null}

            {editingEdge ? (
              <Panel position="top-center">
                <div className="qb-edge-editor" role="dialog" aria-label={t("نوع العلاقة")}>
                  <div className="head">
                    <span>{t("نوع العلاقة")}</span>
                    <button type="button" onClick={() => setEditingEdge(null)} aria-label={t("إغلاق")}>
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <div className="chips">
                    {RELATION_LABELS.map((label) => (
                      <button key={label} type="button" onClick={() => setEdgeLabel(editingEdge, t(label))}>
                        {t(label)}
                      </button>
                    ))}
                  </div>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      setEdgeLabel(editingEdge, edgeText.trim().slice(0, 40));
                    }}
                  >
                    <input
                      value={edgeText}
                      onChange={(event) => setEdgeText(event.target.value)}
                      placeholder={t("وصف آخر…")}
                      maxLength={40}
                      aria-label={t("وصف العلاقة")}
                    />
                    <button type="submit">{t("تمّ")}</button>
                  </form>
                  <button type="button" className="remove" onClick={() => removeEdge(editingEdge)}>
                    <Icon name="trash" size={13} /> {t("حذف العلاقة")}
                  </button>
                </div>
              </Panel>
            ) : null}
          </ReactFlow>
        </div>

        {compact && selectedNodes.length > 0 && !editingEdge ? (
          styleSheet ? (
            <div className="qb-style-sheet">
              <StyleStrip
                style={readStyle(selectedNodes[0].data)}
                canDelete={deletableSelection > 0}
                onChange={applyStyle}
                onDelete={deleteSelection}
                onHide={selectedAyahIds.length ? () => hideAyahs(selectedAyahIds) : undefined}
                onClose={closeStyleSheet}
              />
            </div>
          ) : (
            <div className="qb-style-pill" role="toolbar" aria-label={t("تنسيق العنصر")}>
              <button type="button" onClick={openStyleSheet}>
                <Icon name="sliders" size={15} /> {t("تنسيق العنصر")}
              </button>
              {selectedAyahIds.length ? (
                <button type="button" className="icon" onClick={() => hideAyahs(selectedAyahIds)} aria-label={t("إخفاء من اللوحة")} title={t("إخفاء من اللوحة (تبقى في الموضوع)")}>
                  <Icon name="eyeOff" size={15} />
                </button>
              ) : null}
              {deletableSelection > 0 ? (
                <button type="button" className="danger" onClick={deleteSelection} aria-label={t("حذف")}>
                  <Icon name="trash" size={15} />
                </button>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </BoardContext.Provider>
  );
}
