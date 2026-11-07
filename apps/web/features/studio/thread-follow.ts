/** How far up the history the reader must go before the jump-to-latest arrow shows. */
export const JUMP_THRESHOLD_PX = 160;

/** Whether the thread is scrolled far enough from its newest message to offer the jump back. */
export function awayFromLatest(thread: { scrollTop: number; clientHeight: number; scrollHeight: number }): boolean {
  return thread.scrollHeight - thread.clientHeight - thread.scrollTop > JUMP_THRESHOLD_PX;
}
