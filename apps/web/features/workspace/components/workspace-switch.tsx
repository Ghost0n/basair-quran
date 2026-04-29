import type { WorkspaceView } from "../types";

export function WorkspaceSwitch({
  visible,
  workspaceView,
  collapsing,
  onViewChange,
}: {
  visible: boolean;
  workspaceView: WorkspaceView;
  collapsing?: boolean;
  onViewChange: (view: WorkspaceView) => void;
}) {
  return (
    <div
      id="readerViewSwitch"
      className={`reader-view-switch${visible ? "" : " hidden"}${collapsing ? " workspace-collapsing" : ""}`}
      role="group"
      aria-label="تبديل عرض النتائج والمصحف"
    >
      <button id="showResultsView" className={`reader-switch-btn ${workspaceView === "results" ? "active" : ""}`} onClick={() => onViewChange("results")} type="button">
        النتائج
      </button>
      <button id="showReaderView" className={`reader-switch-btn ${workspaceView === "reader" ? "active" : ""}`} onClick={() => onViewChange("reader")} type="button">
        المصحف
      </button>
    </div>
  );
}
