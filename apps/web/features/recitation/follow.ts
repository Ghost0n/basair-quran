"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the reader follows the recitation (turns its pages, scrolls to the
 * recited verse). A place opened on purpose while a recitation goes on — a
 * search result, a library verse — stops it: the reader shows that place as
 * if nothing were being recited, and «الآية المتلوّة» (the reader's dock, the
 * capsule) brings it back to the recited verse and to following. The next
 * recitation starts following again.
 */
let paused = false;
// «الآية المتلوّة» tapped where the reader isn't showing (the capsule on
// another screen): the reader opens on the recited verse.
let showPending = false;
let requests = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setFollowPaused(value: boolean): void {
  if (paused === value) return;
  paused = value;
  notify();
}

export function isFollowPaused(): boolean {
  return paused;
}

export function useFollowPaused(): boolean {
  return useSyncExternalStore(subscribe, () => paused, () => false);
}

/** Ask the reader to show the recited verse (and follow again). */
export function requestShowRecited(): void {
  showPending = true;
  requests += 1;
  notify();
}

/** A pending request, without taking it (the reader's entry leaves it to the request). */
export function showRecitedPending(): boolean {
  return showPending;
}

/** Take the pending request (true once). */
export function takeShowRecited(): boolean {
  const pending = showPending;
  showPending = false;
  return pending;
}

/** Changes with every request (the reader reacts to it). */
export function useShowRecitedRequests(): number {
  return useSyncExternalStore(subscribe, () => requests, () => 0);
}

export function resetFollowForTests(): void {
  paused = false;
  showPending = false;
  requests = 0;
}
