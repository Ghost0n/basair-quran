"use client";

import { Icon } from "./icon";

/**
 * A recoverable error surface — a message plus an optional Retry action so a
 * transient backend/network failure isn't a dead end. Use anywhere a fetch
 * can fail (reader page, search, suggestions).
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = "إعادة المحاولة",
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div className={`qb-error-state ${className}`.trim()} role="alert">
      <Icon name="alert" size={20} />
      <p className="qb-error-state-msg">{message}</p>
      {onRetry ? (
        <button type="button" className="qb-error-state-retry" onClick={onRetry}>
          <Icon name="history" size={13} /> {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
