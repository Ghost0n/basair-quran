"use client";

import "@xyflow/react/dist/style.css";
import "@/features/themes/themes.css";
import "./board.css";
import "./board.web.css";

import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";

import type { NotebookItem, PostBoardSnapshot } from "@q-basair/shared";

import { useWorkspace } from "@/features/shell/workspace-context";

import { BoardContext, type BoardContextValue } from "./board-context";
import { AyahNode, HeadingNode, NoteNode, ShapeNode } from "./board-nodes";

const NODE_TYPES = { ayah: AyahNode, note: NoteNode, heading: HeadingNode, shape: ShapeNode };

/**
 * A shared theme board, read-only: pan, zoom and expand ayahs into their
 * passage, but nothing moves or changes. Ayah text comes from the post's
 * snapshot, so readers need no access to the author's notebook.
 */
export function BoardView({ snapshot, onOpenAyah }: { snapshot: PostBoardSnapshot; onOpenAyah?: (item: NotebookItem) => void }) {
  return (
    <ReactFlowProvider>
      <View snapshot={snapshot} onOpenAyah={onOpenAyah} />
    </ReactFlowProvider>
  );
}

function View({ snapshot, onOpenAyah }: { snapshot: PostBoardSnapshot; onOpenAyah?: (item: NotebookItem) => void }) {
  const { state } = useWorkspace();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const items = useMemo(() => {
    const map = new Map<string, NotebookItem>();
    for (const node of snapshot.board.nodes) {
      const ayah = snapshot.ayahs[node.id];
      if (node.type !== "ayah" || !ayah) continue;
      map.set(node.id, {
        id: 0,
        ayah_id: Number(node.data.ayah_id ?? 0),
        mushaf_id: Number(node.data.mushaf_id ?? 2),
        surah_id: ayah.surah_id,
        surah: ayah.surah,
        ayah: ayah.ayah,
        text: ayah.text,
        theme_ids: [],
        created_at: 0,
      });
    }
    return map;
  }, [snapshot]);

  const nodes: Node[] = useMemo(
    () =>
      snapshot.board.nodes
        .filter((node) => node.type !== "ayah" || items.has(node.id))
        .map((node) => ({
          id: node.id,
          type: node.type,
          position: { x: node.x, y: node.y },
          data: { ...node.data, expanded: expanded[node.id] ?? false },
          draggable: false,
          connectable: false,
          deletable: false,
          ...(node.w ? { width: node.w } : {}),
          ...(node.h ? { height: node.h } : {}),
        })),
    [snapshot, items, expanded],
  );
  const edges: Edge[] = useMemo(
    () =>
      snapshot.board.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? undefined,
      })),
    [snapshot],
  );

  const context: BoardContextValue = {
    themeColor: snapshot.theme.color,
    itemFor: (nodeId) => items.get(nodeId) ?? null,
    updateData: (nodeId, patch) => {
      if ("expanded" in patch) setExpanded((current) => ({ ...current, [nodeId]: Boolean(patch.expanded) }));
    },
    openInReader: (item) => onOpenAyah?.(item),
    readOnly: true,
  };

  return (
    <BoardContext.Provider value={context}>
      <div className="qb-board-canvas qb-board-readonly" dir="ltr" data-hl={snapshot.theme.color}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          forceColorMode={state.theme === "light" ? "light" : "dark"}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </div>
    </BoardContext.Provider>
  );
}
