"use client";

import "@xyflow/react/dist/style.css";
import "@/features/themes/themes.css";
import "./board.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "@xyflow/react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { NotebookItem, ThemeBoard, ThemeDetail } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { useWorkspace } from "@/features/shell/workspace-context";

import {
  RELATION_LABELS,
  arrangeBoard,
  ayahNodeId,
  newNodeId,
  reconcileBoard,
  sanitizeBoard,
} from "./board-model";
import { BoardContext, type BoardContextValue } from "./board-context";
import { AyahNode, HeadingNode, NoteNode } from "./board-nodes";
import { documentFromBoard } from "@/features/documents/convert";
import { createDocumentUrl } from "@/features/documents/open-document";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

const NODE_TYPES = { ayah: AyahNode, note: NoteNode, heading: HeadingNode };
const SAVE_DELAY_MS = 900;

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
      type: node.type as "ayah" | "note" | "heading",
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      ...(node.width && node.type !== "ayah" ? { w: Math.round(node.width) } : {}),
      ...(node.height && node.type === "note" ? { h: Math.round(node.height) } : {}),
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
  const themeId = Number(params.get("theme"));
  const { setMode } = useShellMode();
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
  const [edgeText, setEdgeText] = useState("");
  const lastSavedRef = useRef<string>("");
  const loadedRef = useRef(false);

  // Load the theme (with its board) and its ayahs, then reconcile.
  useEffect(() => {
    if (!Number.isInteger(themeId) || themeId <= 0) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    loadedRef.current = false;
    setStatus("loading");
    Promise.all([api.getTheme(themeId), api.getNotebook()])
      .then(([detail, notebook]) => {
        if (cancelled) return;
        const themed = notebook.filter((item) => item.theme_ids?.includes(themeId));
        const board = reconcileBoard(sanitizeBoard(detail.board), themed);
        const flowState = toFlow(board);
        setTheme(detail);
        setItems(themed);
        setNodes(flowState.nodes);
        setEdges(flowState.edges);
        lastSavedRef.current = JSON.stringify(detail.board ?? null);
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
  }, [themeId]);

  // Debounced autosave whenever the board's persisted content changes.
  const save = useCallback(async () => {
    if (!loadedRef.current || !theme) return;
    const board = toBoard(flow.getNodes(), flow.getEdges());
    const encoded = JSON.stringify(board);
    if (encoded === lastSavedRef.current) return;
    setSaveState("saving");
    try {
      await api.saveThemeBoard(theme.id, board);
      lastSavedRef.current = encoded;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [flow, theme]);

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
      ]),
    [nodes, edges],
  );
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

  function addNode(type: "note" | "heading") {
    const id = newNodeId(type === "note" ? "n" : "h");
    const position = freeSpot(flow.getNodes());
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      { id, type, position, data: { text: "", autoFocus: true }, selected: true },
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
      router.push(await createDocumentUrl(documentFromBoard(theme, board, items, ayahNodeId)));
    } catch {
      setSaveState("error");
    } finally {
      setExporting(false);
    }
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
        <button type="button" onClick={() => setMode("notebook")}>{t("العودة إلى الدفتر")}</button>
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

  return (
    <BoardContext.Provider value={context}>
      <div className="qb-board" data-hl={theme?.color ?? undefined}>
        <div className="qb-board-bar">
          <button type="button" className="back" onClick={() => setMode("notebook")} aria-label={t("العودة إلى الدفتر")}>
            <Icon name="chevRight" size={18} />
          </button>
          <div className="title">
            <span className="dot" aria-hidden />
            <h1>{theme?.name ?? "…"}</h1>
            <span className="meta">
              {t("لوحة الموضوع،")} {formatNumber(ayahCount)} {ayahCount === 1 ? t("آية") : t("آيات")}
            </span>
          </div>
          <div className="tools">
            <button type="button" onClick={() => addNode("note")}>
              <Icon name="edit" size={15} /> <span className="lbl">{t("ملاحظة")}</span>
            </button>
            <button type="button" onClick={() => addNode("heading")}>
              <Icon name="flag" size={15} /> <span className="lbl">{t("عنوان")}</span>
            </button>
            <button type="button" onClick={arrange} title={t("ترتيب الآيات حسب ترتيب المصحف")}>
              <Icon name="layers" size={15} /> <span className="lbl">{t("ترتيب")}</span>
            </button>
            <button type="button" onClick={() => void exportAsDocument()} disabled={exporting || items.length === 0}>
              <Icon name="page" size={15} /> <span className="lbl">{t("صدّر كبحث")}</span>
            </button>
            <span className={`save ${saveState}`} role="status" aria-live="polite">
              {saveLabel}
            </span>
          </div>
        </div>

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
            colorMode={workspace.theme === "light" ? "light" : "dark"}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }}
            deleteKeyCode={["Backspace", "Delete"]}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            <Controls showInteractive={false} position="bottom-left" />
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
      </div>
    </BoardContext.Provider>
  );
}
