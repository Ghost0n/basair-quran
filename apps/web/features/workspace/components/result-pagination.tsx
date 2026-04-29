export function ResultPagination({
  current,
  total,
  draftValue,
  onDraftChange,
  onPageChange,
}: {
  current: number;
  total: number;
  draftValue: string;
  onDraftChange: (value: string) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <div className="reader-page-controls result-page-controls">
        <button
          className="reader-page-btn"
          disabled={current === 1}
          onClick={() => onPageChange(current - 1)}
          type="button"
        >
          →
        </button>

        <div className="reader-page-jump result-page-jump">
          <span>صفحة</span>
          <input
            type="number"
            min={1}
            max={total}
            value={draftValue}
            inputMode="numeric"
            aria-label="رقم صفحة النتائج"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const rawValue = (event.target as HTMLInputElement).value.trim();
                const value = Number(rawValue);
                if (rawValue && Number.isFinite(value)) {
                  onPageChange(value);
                } else {
                  onDraftChange(String(current));
                }
              }
            }}
            onBlur={(event) => {
              const rawValue = event.target.value.trim();
              const value = Number(rawValue);
              if (rawValue && Number.isFinite(value)) {
                onPageChange(value);
              } else {
                onDraftChange(String(current));
              }
            }}
          />
          <span>{`من ${total}`}</span>
        </div>

        <button
          className="reader-page-btn"
          disabled={current === total}
          onClick={() => onPageChange(current + 1)}
          type="button"
        >
          ←
        </button>
      </div>
    </div>
  );
}
